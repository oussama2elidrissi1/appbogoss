<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAdvanceRequest;
use App\Http\Requests\UpdateAdvanceRequest;
use App\Http\Resources\AdvanceResource;
use App\Models\Advance;
use App\Services\WorkDayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdvanceController extends Controller
{
    public function store(StoreAdvanceRequest $request, WorkDayService $service): JsonResponse
    {
        $data = $request->validated();

        if (empty($data['work_day_id'])) {
            $activeDay = $service->getActiveDay();
            $data['work_day_id'] = $activeDay?->id;
        }

        $advance = Advance::create($data);
        $advance->load('employee');

        return response()->json(['data' => new AdvanceResource($advance)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')],
        ]);

        $advances = Advance::with('employee')
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

    public function update(UpdateAdvanceRequest $request, Advance $advance): JsonResponse
    {
        $advance->update($request->validated());
        $advance->load('employee');

        return response()->json(['data' => new AdvanceResource($advance)]);
    }

    public function destroy(Request $request, Advance $advance): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        $expected = (string) config('services.patron_password');

        if ($expected === '' || ! hash_equals($expected, $validated['password'])) {
            throw ValidationException::withMessages([
                'password' => 'Mot de passe patron incorrect.',
            ]);
        }

        $advance->delete();

        return response()->json(status: 204);
    }
}
