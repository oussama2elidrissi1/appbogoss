<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AppointmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'status' => ['nullable', 'string'],
        ]);

        $query = Appointment::with(['client', 'employee', 'service'])
            ->orderBy('starts_at');

        if (! empty($validated['date'])) {
            $query->whereDate('starts_at', Carbon::parse($validated['date'])->toDateString());
        } else {
            $from = Carbon::parse($validated['date_from'] ?? now()->toDateString())->startOfDay();
            $to = Carbon::parse($validated['date_to'] ?? $from->toDateString())->endOfDay();
            $query->whereBetween('starts_at', [$from, $to]);
        }

        if (! empty($validated['employee_id'])) {
            $query->where('employee_id', $validated['employee_id']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return response()->json(['data' => AppointmentResource::collection($query->get())]);
    }

    public function store(StoreAppointmentRequest $request): JsonResponse
    {
        $appointment = Appointment::create($this->payloadWithEnd($request->validated()));
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)], 201);
    }

    public function show(Appointment $appointment): JsonResponse
    {
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function update(UpdateAppointmentRequest $request, Appointment $appointment): JsonResponse
    {
        $appointment->update($this->payloadWithEnd($request->validated(), $appointment));
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function destroy(Appointment $appointment): JsonResponse
    {
        $appointment->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function payloadWithEnd(array $data, ?Appointment $appointment = null): array
    {
        if (! array_key_exists('starts_at', $data)
            && ! array_key_exists('service_id', $data)
            && ! array_key_exists('employee_id', $data)
            && ! array_key_exists('items', $data)
            && ! array_key_exists('duration_override_minutes', $data)) {
            return $data;
        }

        $items = $data['items'] ?? $appointment?->reservation_items;
        if (empty($items)) {
            $items = [[
                'service_id' => $data['service_id'] ?? $appointment?->service_id,
                'employee_id' => $data['employee_id'] ?? $appointment?->employee_id,
            ]];
        }

        $items = collect($items)
            ->map(fn (array $item) => [
                'service_id' => (int) $item['service_id'],
                'employee_id' => isset($item['employee_id']) && $item['employee_id'] !== '' && $item['employee_id'] !== null
                    ? (int) $item['employee_id']
                    : null,
            ])
            ->values()
            ->all();

        $serviceIds = collect($items)->pluck('service_id')->unique()->values();
        $services = Service::query()->whereIn('id', $serviceIds)->get()->keyBy('id');
        if ($services->count() !== $serviceIds->count()) {
            abort(422, 'Une prestation sélectionnée n’existe plus.');
        }

        $employeeIds = collect($items)->pluck('employee_id')->filter()->unique()->values();
        if (Employee::query()->whereIn('id', $employeeIds)->count() !== $employeeIds->count()) {
            abort(422, 'Un employé sélectionné n’existe plus.');
        }

        $startsAt = Carbon::parse($data['starts_at'] ?? $appointment?->starts_at);
        $assigned = collect($items)->filter(fn (array $item) => $item['employee_id'] !== null);
        $unassigned = collect($items)->filter(fn (array $item) => $item['employee_id'] === null);
        $durationByEmployee = $assigned->groupBy('employee_id')->map(
            fn ($employeeItems) => $employeeItems->sum(fn (array $item) => (int) $services[$item['service_id']]->duration_minutes),
        );
        $unassignedDuration = $unassigned->sum(fn (array $item) => (int) $services[$item['service_id']]->duration_minutes);
        $autoDuration = max((int) $durationByEmployee->max(), $unassignedDuration);

        $itemsProvided = array_key_exists('items', $data);
        $overrideProvided = array_key_exists('duration_override_minutes', $data);

        if ($overrideProvided && $data['duration_override_minutes'] !== null) {
            // Explicit resize from the calendar (drag the bottom edge) — trust it as-is.
            $duration = max(5, (int) $data['duration_override_minutes']);
            $durationOverride = $duration;
        } elseif (! $itemsProvided && ! $overrideProvided && $appointment?->duration_override_minutes) {
            // Move without touching services/duration — keep the previously resized length.
            $duration = (int) $appointment->duration_override_minutes;
            $durationOverride = $duration;
        } else {
            // Services changed (or first creation) — fall back to the catalog-derived duration.
            $duration = $autoDuration;
            $durationOverride = null;
        }

        $data['starts_at'] = $startsAt;
        $data['ends_at'] = $startsAt->copy()->addMinutes($duration);
        $data['service_id'] = $items[0]['service_id'];
        $data['employee_id'] = $assigned->first()['employee_id'] ?? null;
        $data['reservation_items'] = $items;
        $data['duration_override_minutes'] = $durationOverride;
        $clientIds = collect($data['client_ids'] ?? ($appointment?->client_ids ?: [$data['client_id'] ?? $appointment?->client_id]))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        if ($clientIds->isEmpty() || Client::query()->whereIn('id', $clientIds)->count() !== $clientIds->count()) {
            abort(422, 'Un client sélectionné n’existe plus.');
        }
        $data['client_ids'] = $clientIds->all();
        $data['client_id'] = $clientIds->first();
        unset($data['items']);
        $data['status'] = $data['status'] ?? $appointment?->status ?? 'confirmed';

        $this->assertNoConflict($items, $startsAt, $data['ends_at'], $appointment);

        return $data;
    }

    /** @param array<int, array{service_id: int, employee_id: ?int}> $items */
    private function assertNoConflict(array $items, Carbon $startsAt, Carbon $endsAt, ?Appointment $appointment = null): void
    {
        $employeeIds = collect($items)->pluck('employee_id')->filter()->unique()->values();
        if ($employeeIds->isEmpty()) {
            return;
        }

        $existing = Appointment::query()
            ->when($appointment, fn ($query) => $query->where('id', '!=', $appointment->id))
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt)
            ->get(['id', 'employee_id', 'reservation_items']);

        foreach ($existing as $candidate) {
            $candidateEmployees = collect($candidate->reservation_items ?: [[
                'employee_id' => $candidate->employee_id,
            ]])->pluck('employee_id')->filter()->map(fn ($id) => (int) $id);

            if ($candidateEmployees->intersect($employeeIds)->isNotEmpty()) {
                abort(422, 'Un employé est déjà réservé sur ce créneau.');
            }
        }
    }
}
