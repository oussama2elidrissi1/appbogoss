<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DayAlreadyClosedException;
use App\Exceptions\DayAlreadyOpenException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWorkDayRequest;
use App\Http\Resources\WorkDayResource;
use App\Models\WorkDay;
use App\Services\WorkDayService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class WorkDayController extends Controller
{
    public function activeDay(WorkDayService $service): JsonResponse
    {
        $day = $service->getActiveDay();

        return response()->json([
            'data' => $day ? new WorkDayResource($day) : null,
        ]);
    }

    public function store(StoreWorkDayRequest $request, WorkDayService $service): JsonResponse
    {
        try {
            $workDay = $service->openDay($request->validated());
        } catch (DayAlreadyOpenException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $workDay->load(['employees', 'openedBy', 'advances.employee']);

        return response()->json(['data' => new WorkDayResource($workDay)], 201);
    }

    public function show(WorkDay $workDay): JsonResponse
    {
        $workDay->load(['employees', 'openedBy', 'advances.employee']);

        return response()->json(['data' => new WorkDayResource($workDay)]);
    }

    public function index(Request $request): JsonResponse
    {
        $workDays = WorkDay::with(['employees', 'openedBy', 'advances.employee'])
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->limit(60)
            ->get();

        return response()->json([
            'data' => WorkDayResource::collection($workDays),
        ]);
    }

    public function close(WorkDay $workDay, WorkDayService $service): JsonResponse
    {
        try {
            $workDay = $service->closeDay($workDay);
        } catch (DayAlreadyClosedException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $workDay->load(['employees', 'openedBy', 'advances.employee']);

        return response()->json(['data' => new WorkDayResource($workDay)]);
    }

    public function pdf(WorkDay $workDay): Response|JsonResponse
    {
        if ($workDay->status !== 'closed' || $workDay->closing_report === null) {
            return response()->json([
                'message' => "Cette journée n'est pas encore clôturée.",
            ], 422);
        }

        $workDay->load(['employees', 'openedBy', 'advances.employee']);

        if (! class_exists(Pdf::class)) {
            // TODO: requires barryvdh/laravel-dompdf, run composer require barryvdh/laravel-dompdf
            return response()->json([
                'work_day' => new WorkDayResource($workDay),
            ]);
        }

        return Pdf::loadView('pdf.work-day-report', ['day' => $workDay])
            ->download("journee-{$workDay->date->toDateString()}.pdf");
    }
}
