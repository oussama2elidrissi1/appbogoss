<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CashMovementResource;
use App\Models\CashMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CashMovementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_day_id' => ['required', 'integer', 'exists:work_days,id'],
        ]);

        $movements = CashMovement::with('user')
            ->where('work_day_id', $validated['work_day_id'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => CashMovementResource::collection($movements)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_day_id' => ['required', 'integer', 'exists:work_days,id'],
            'type' => ['required', Rule::in(['in', 'out'])],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'label' => ['required', 'string', 'max:255'],
        ]);

        $movement = CashMovement::create([...$validated, 'user_id' => $request->user()->id]);

        return response()->json(['data' => new CashMovementResource($movement->load('user'))], 201);
    }
}
