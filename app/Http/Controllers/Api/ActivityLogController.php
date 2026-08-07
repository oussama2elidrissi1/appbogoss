<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'action' => ['nullable', 'string'],
            'user_id' => ['nullable', 'integer'],
        ]);

        $query = ActivityLog::with(['user', 'client'])->orderByDesc('created_at');

        if (! empty($validated['from'])) {
            $query->whereDate('created_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('created_at', '<=', $validated['to']);
        }
        if (! empty($validated['action'])) {
            $query->where('action', 'like', $validated['action'].'%');
        }
        if (! empty($validated['user_id'])) {
            $query->where('user_id', $validated['user_id']);
        }

        $logs = $query->limit(200)->get();

        return response()->json(['data' => ActivityLogResource::collection($logs)]);
    }
}
