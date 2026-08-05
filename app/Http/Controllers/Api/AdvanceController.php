<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAdvanceRequest;
use App\Http\Requests\UpdateAdvanceRequest;
use App\Http\Resources\AdvanceResource;
use App\Models\Advance;
use App\Models\Employee;
use App\Services\ActivityLogger;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdvanceController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function store(StoreAdvanceRequest $request, WorkDayService $service): JsonResponse
    {
        $data = $request->validated();

        if (empty($data['work_day_id'])) {
            $activeDay = $service->getActiveDay();
            $data['work_day_id'] = $activeDay?->id;
        }

        $advance = Advance::create($data);
        $advance->load(['employee', 'workDay']);

        return response()->json(['data' => new AdvanceResource($advance)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')],
        ]);

        $advances = Advance::with(['employee', 'commissionPayout', 'workDay'])
            ->where('employee_id', $validated['employee_id'])
            ->orderByDesc('given_on')
            ->get();

        $outstandingTotal = (float) Advance::where('employee_id', $validated['employee_id'])
            ->outstanding()
            ->sum('amount');

        return response()->json([
            'data' => AdvanceResource::collection($advances),
            'outstanding_total' => $outstandingTotal,
        ]);
    }

    public function settle(Advance $advance): JsonResponse
    {
        $advance->update(['settled_at' => now()]);
        $advance->load('employee');

        return response()->json(['data' => new AdvanceResource($advance)]);
    }

    /**
     * Bulk correction for advances that were actually reimbursed before the
     * "Paie" payout feature existed and so were never marked settled — marks
     * every currently-outstanding advance given before a cutoff date as
     * settled, without creating a CommissionPayout (there is no payment to
     * record, the money already changed hands). Money-affecting, so it goes
     * through the same patron-password gate as editing/deleting an advance.
     */
    public function settleBefore(Request $request): JsonResponse
    {
        $this->assertPatronPassword($request);

        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')],
            'before' => ['required', 'date'],
        ]);

        $employee = Employee::findOrFail($validated['employee_id']);

        $advances = Advance::where('employee_id', $employee->id)
            ->outstanding()
            ->where('given_on', '<', $validated['before'])
            ->get();

        if ($advances->isNotEmpty()) {
            Advance::whereIn('id', $advances->pluck('id'))->update(['settled_at' => now()]);

            $this->activityLogger->log('advance.bulk_settled', $employee, [
                'before' => $validated['before'],
            ], [
                'settled_count' => $advances->count(),
                'settled_total' => round((float) $advances->sum('amount'), 2),
            ]);
        }

        return response()->json([
            'settled_count' => $advances->count(),
            'settled_total' => round((float) $advances->sum('amount'), 2),
        ]);
    }

    public function update(UpdateAdvanceRequest $request, Advance $advance): JsonResponse
    {
        $this->assertPatronPassword($request);

        $advance->update(collect($request->validated())->except('password')->all());
        $advance->load(['employee', 'workDay', 'commissionPayout']);

        return response()->json(['data' => new AdvanceResource($advance)]);
    }

    public function destroy(Request $request, Advance $advance): JsonResponse
    {
        $this->assertPatronPassword($request);

        $advance->delete();

        return response()->json(status: 204);
    }

    /**
     * Correcting or erasing an advance requires the patron-only password, verified
     * server-side — except for Super Admin, who already carries full authority
     * over the app and shouldn't need a second shared secret.
     */
    private function assertPatronPassword(Request $request): void
    {
        if ($request->user()?->hasRole('super-admin')) {
            return;
        }

        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        $expected = (string) config('services.patron_password');

        if ($expected === '' || ! hash_equals($expected, $validated['password'])) {
            throw ValidationException::withMessages([
                'password' => 'Mot de passe patron incorrect.',
            ]);
        }
    }
}
