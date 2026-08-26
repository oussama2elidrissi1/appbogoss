<?php

namespace App\Http\Controllers\Api\PosV2;

use App\Http\Controllers\Controller;
use App\Services\PosV2\PosService;
use Illuminate\Http\JsonResponse;

class PosDashboardController extends Controller
{
    public function __construct(private readonly PosService $pos) {}

    /** §33 — "Caisse — Aujourd'hui", scoped to the active work day. */
    public function __invoke(): JsonResponse
    {
        return response()->json(['data' => $this->pos->dashboard()]);
    }
}
