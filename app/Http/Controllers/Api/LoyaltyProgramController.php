<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LoyaltyProgramResource;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    /**
     * Where every client stands on this program — the same current/threshold
     * arithmetic the customer portal already shows each client individually
     * (PortalLoyaltyController::programProgressPayload), but across all
     * clients for the admin. The counting column depends on the program type
     * (the canonical mapping used everywhere by LoyaltyEngine): points →
     * points_balance, amount_spent → amount_accumulated, else → counter.
     */
    public function progress(LoyaltyProgram $loyaltyProgram): JsonResponse
    {
        $field = match ($loyaltyProgram->type) {
            LoyaltyProgram::TYPE_POINTS => 'points_balance',
            LoyaltyProgram::TYPE_AMOUNT_SPENT => 'amount_accumulated',
            default => 'counter',
        };

        $threshold = (float) ($loyaltyProgram->config['threshold'] ?? 0);

        $rewardCounts = LoyaltyReward::where('loyalty_program_id', $loyaltyProgram->id)
            ->where('status', '!=', LoyaltyReward::STATUS_CANCELLED)
            ->select('client_id', DB::raw('count(*) as total'))
            ->groupBy('client_id')
            ->pluck('total', 'client_id');

        $rows = LoyaltyProgramProgress::where('loyalty_program_id', $loyaltyProgram->id)
            ->with('client:id,name,phone,avatar_color')
            ->orderByDesc($field)
            ->orderByDesc('last_activity_at')
            ->get()
            ->map(function (LoyaltyProgramProgress $progress) use ($field, $threshold, $rewardCounts) {
                $current = (float) $progress->{$field};

                return [
                    'client_id' => $progress->client_id,
                    'client_name' => $progress->client?->name,
                    'client_phone' => $progress->client?->phone,
                    'avatar_color' => $progress->client?->avatar_color,
                    'current' => round($current, 2),
                    'threshold' => $threshold > 0 ? round($threshold, 2) : null,
                    'percent' => $threshold > 0 ? (int) min(100, round($current / $threshold * 100)) : null,
                    'remaining' => $threshold > 0 ? round(max(0, $threshold - $current), 2) : null,
                    'rewards_earned' => (int) ($rewardCounts[$progress->client_id] ?? 0),
                    'last_activity_at' => $progress->last_activity_at?->toIso8601String(),
                ];
            })
            ->values();

        return response()->json([
            'data' => $rows,
            'meta' => [
                'participants' => $rows->count(),
                'threshold' => $threshold > 0 ? round($threshold, 2) : null,
                'rewards_total' => (int) $rewardCounts->sum(),
            ],
        ]);
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
