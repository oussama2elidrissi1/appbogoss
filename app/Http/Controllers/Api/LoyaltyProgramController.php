<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LoyaltyProgramResource;
use App\Models\LoyaltyProgram;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD scaffolding for loyalty programs — no consuming UI yet (Phase
 * 3), but routed and permission-gated now so the engine can be exercised
 * end-to-end without hand-seeding every scenario.
 */
class LoyaltyProgramController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(): JsonResponse
    {
        $programs = LoyaltyProgram::query()->orderByDesc('created_at')->get();

        return response()->json(['data' => LoyaltyProgramResource::collection($programs)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validated($request);

        $program = LoyaltyProgram::create($validated);

        $this->activityLogger->log('loyalty.program_created', $program, [], $validated);

        return response()->json(['data' => new LoyaltyProgramResource($program)], 201);
    }

    public function show(LoyaltyProgram $loyaltyProgram): JsonResponse
    {
        return response()->json(['data' => new LoyaltyProgramResource($loyaltyProgram)]);
    }

    public function update(Request $request, LoyaltyProgram $loyaltyProgram): JsonResponse
    {
        $validated = $this->validated($request, $loyaltyProgram);
        $old = $loyaltyProgram->only(array_keys($validated));

        $loyaltyProgram->update($validated);

        $this->activityLogger->log('loyalty.program_updated', $loyaltyProgram, $old, $validated);

        return response()->json(['data' => new LoyaltyProgramResource($loyaltyProgram)]);
    }

    public function destroy(LoyaltyProgram $loyaltyProgram): JsonResponse
    {
        $loyaltyProgram->update(['is_active' => false]);

        $this->activityLogger->log('loyalty.program_deactivated', $loyaltyProgram);

        return response()->json(['data' => new LoyaltyProgramResource($loyaltyProgram)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?LoyaltyProgram $existing = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'type' => ['required', Rule::in([
                LoyaltyProgram::TYPE_SERVICE_COUNT,
                LoyaltyProgram::TYPE_POINTS,
                LoyaltyProgram::TYPE_AMOUNT_SPENT,
                LoyaltyProgram::TYPE_VISIT_COUNT,
                LoyaltyProgram::TYPE_BIRTHDAY,
                LoyaltyProgram::TYPE_CUSTOM,
            ])],
            'is_active' => ['nullable', 'boolean'],
            'config' => ['nullable', 'array'],
            'commission_basis' => ['nullable', Rule::in(['none', 'public_price', 'fixed', 'percent', 'internal_value'])],
            'commission_value' => ['nullable', 'numeric', 'min:0'],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }
}
