<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyReward;
use App\Services\LoyaltyEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Super Admin manual corrections to a client's loyalty state (§11) — every
 * action here requires a reason and is fully audited via ActivityLogger
 * (enforced inside LoyaltyEngine, not re-implemented here).
 */
class ClientLoyaltyAdjustmentController extends Controller
{
    public function __construct(private readonly LoyaltyEngine $loyaltyEngine)
    {
    }

    public function adjustProgress(Request $request, Client $client, LoyaltyProgram $program): JsonResponse
    {
        $validated = $request->validate([
            'new_value' => ['required', 'numeric', 'min:0'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $progress = $this->loyaltyEngine->adjustProgressManually(
            $client,
            $program,
            (float) $validated['new_value'],
            $validated['reason'],
            $request->user(),
        );

        return response()->json(['data' => [
            'client_id' => $progress->client_id,
            'program_id' => $progress->loyalty_program_id,
            'counter' => $progress->counter,
            'points_balance' => $progress->points_balance,
            'amount_accumulated' => (float) $progress->amount_accumulated,
        ]]);
    }

    public function grantReward(Request $request, Client $client, LoyaltyProgram $program): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $reward = $this->loyaltyEngine->grantRewardManually($client, $program, $validated['reason'], $request->user());

        return response()->json(['data' => ['id' => $reward->id, 'status' => $reward->status]], 201);
    }

    public function cancelReward(Request $request, LoyaltyReward $loyaltyReward): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $reward = $this->loyaltyEngine->cancelRewardManually($loyaltyReward, $validated['reason'], $request->user());

        return response()->json(['data' => ['id' => $reward->id, 'status' => $reward->status]]);
    }
}
