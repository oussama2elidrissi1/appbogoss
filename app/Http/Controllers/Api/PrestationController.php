<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ConfirmPrestationPaymentRequest;
use App\Http\Requests\StorePrestationRequest;
use App\Http\Resources\PrestationResource;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Services\ActivityLogger;
use App\Services\PrestationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PrestationController extends Controller
{
    public function __construct(private readonly PrestationService $service, private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string'],
            'employee_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = Prestation::query()->with(['employee', 'client', 'items'])->orderByDesc('created_at');

        $actor = $request->user();
        $canViewAll = $actor->can('caisse.manage') || $actor->can('reports.view_all');

        if (! $canViewAll) {
            if ($actor->employee === null) {
                return response()->json(['data' => []]);
            }
            $query->where('employee_id', $actor->employee->id);
        } elseif (! empty($validated['employee_id'])) {
            $query->where('employee_id', $validated['employee_id']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['from'])) {
            $query->whereDate('created_at', '>=', $validated['from']);
        }

        if (! empty($validated['to'])) {
            $query->whereDate('created_at', '<=', $validated['to']);
        }

        return response()->json(['data' => PrestationResource::collection($query->get())]);
    }

    /** Admin/caissier real-time payment queue. */
    public function pending(Request $request): JsonResponse
    {
        if (! $request->user()->can('prestations.confirm_payment')) {
            return response()->json(['message' => 'Action non autorisée.'], 403);
        }

        $prestations = Prestation::query()
            ->with(['employee', 'client', 'items'])
            ->where('status', Prestation::STATUS_PENDING_PAYMENT)
            ->orderBy('validated_at')
            ->get();

        return response()->json(['data' => PrestationResource::collection($prestations)]);
    }

    public function store(StorePrestationRequest $request): JsonResponse
    {
        $this->authorize('create', Prestation::class);

        $actor = $request->user();
        $employee = $actor->employee;

        if ($employee === null) {
            throw ValidationException::withMessages([
                'employee_id' => 'Votre compte n’est lié à aucune fiche employé.',
            ]);
        }

        $prestation = $this->service->create($request->validated(), $employee, $actor);

        return response()->json(['data' => new PrestationResource($prestation)], 201);
    }

    public function show(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('view', $prestation);

        $prestation->load(['items', 'employee', 'client', 'statusLogs.user']);

        return response()->json(['data' => new PrestationResource($prestation)]);
    }

    public function storeItem(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('update', $prestation);

        $validated = $request->validate([
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
            'label' => ['required_without:service_id', 'nullable', 'string', 'max:255'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'duration_minutes' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $this->service->addItem($prestation, $validated, $request->user());

        return response()->json(['data' => new PrestationResource($prestation->fresh(['items']))], 201);
    }

    public function updateItem(Request $request, Prestation $prestation, PrestationItem $item): JsonResponse
    {
        $this->authorize('update', $prestation);

        $validated = $request->validate([
            'quantity' => ['nullable', 'integer', 'min:1'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $this->service->updateItem($prestation, $item, $validated);

        return response()->json(['data' => new PrestationResource($prestation->fresh(['items']))]);
    }

    public function destroyItem(Request $request, Prestation $prestation, PrestationItem $item): JsonResponse
    {
        $this->authorize('update', $prestation);

        $this->service->removeItem($prestation, $item);

        return response()->json(['data' => new PrestationResource($prestation->fresh(['items']))]);
    }

    public function completeServices(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('update', $prestation);

        $updated = $this->service->markServicesDone($prestation, $request->user());

        return response()->json(['data' => new PrestationResource($updated->load('items'))]);
    }

    public function sendToCaisse(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('update', $prestation);

        $updated = $this->service->sendToCaisse($prestation, $request->user());

        return response()->json(['data' => new PrestationResource($updated->load('items'))]);
    }

    public function confirmPayment(ConfirmPrestationPaymentRequest $request, Prestation $prestation): JsonResponse
    {
        if (! $request->user()->can('prestations.confirm_payment')) {
            return response()->json(['message' => 'Action non autorisée.'], 403);
        }

        $updated = $this->service->confirmPayment($prestation, $request->validated(), $request->user());

        return response()->json(['data' => new PrestationResource($updated)]);
    }

    public function cancel(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('cancel', $prestation);

        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $updated = $this->service->cancel($prestation, $validated['reason'] ?? null, $request->user());

        return response()->json(['data' => new PrestationResource($updated)]);
    }

    public function refund(Request $request, Prestation $prestation): JsonResponse
    {
        if (! $request->user()->can('prestations.edit_paid')) {
            return response()->json(['message' => 'Action réservée au Super Admin.'], 403);
        }

        $validated = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $updated = $this->service->refund($prestation, $validated['reason'], $request->user());

        return response()->json(['data' => new PrestationResource($updated)]);
    }

    public function print(Request $request, Prestation $prestation): JsonResponse
    {
        $this->authorize('view', $prestation);

        $prestation->increment('print_count');

        $this->activityLogger->log(
            $prestation->print_count > 1 ? 'prestation.reprint' : 'prestation.print',
            $prestation,
            [],
            ['print_count' => $prestation->print_count],
        );

        return response()->json(['data' => new PrestationResource($prestation->fresh(['items']))]);
    }
}
