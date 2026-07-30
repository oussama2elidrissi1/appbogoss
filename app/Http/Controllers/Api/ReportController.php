<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WorkDayService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Throwable;

class ReportController extends Controller
{
    public function monthly(Request $request, WorkDayService $service): JsonResponse
    {
        $month = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ])['month'] ?? now()->format('Y-m');

        return response()->json([
            'data' => $service->buildMonthlyReport($month),
        ]);
    }

    public function monthlyPdf(Request $request, WorkDayService $service): Response|JsonResponse
    {
        $month = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ])['month'] ?? now()->format('Y-m');
        $report = $service->buildMonthlyReport($month);
        $viewData = ['report' => $report];

        if (! class_exists(Pdf::class)) {
            return response()->view('pdf.monthly-report', $viewData);
        }

        try {
            return Pdf::loadView('pdf.monthly-report', $viewData)
                ->download("rapport-mensuel-{$month}.pdf");
        } catch (Throwable) {
            return response()->view('pdf.monthly-report', $viewData);
        }
    }
}
