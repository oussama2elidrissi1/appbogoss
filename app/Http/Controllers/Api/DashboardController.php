<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function index(DashboardService $service): JsonResponse
    {
        return response()->json($service->getStats()->toArray());
    }
}
