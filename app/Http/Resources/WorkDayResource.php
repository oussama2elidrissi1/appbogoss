<?php

namespace App\Http\Resources;

use App\Services\WorkDayService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkDayResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $this->resource->loadMissing('advances.employee');

        $reportSnapshot = $this->closing_report;

        // Older closed days contain the initial, shorter report snapshot. Rebuild
        // those reports so the history exposes the same detail as new days.
        if ($reportSnapshot === null || ! array_key_exists('employee_by_prestation', $reportSnapshot)) {
            $reportSnapshot = app(WorkDayService::class)->buildClosingReport($this->resource);
        }

        return [
            'id' => $this->id,
            'date' => $this->date->toDateString(),
            'status' => $this->status,
            'opening_balance' => (float) $this->opening_balance,
            'closed_at' => $this->closed_at,
            'notes' => $this->notes,
            'opened_by' => $this->openedBy ? [
                'id' => $this->openedBy->id,
                'name' => $this->openedBy->name,
            ] : null,
            'employees' => $this->employees->map(fn ($employee) => [
                'id' => $employee->id,
                'name' => $employee->name,
                'avatar_color' => $employee->avatar_color,
                'role' => $employee->role,
                'present' => (bool) $employee->pivot->present,
            ])->all(),
            'advances' => $this->advances->map(fn ($advance) => [
                'id' => $advance->id,
                'employee_id' => $advance->employee_id,
                'employee_name' => $advance->employee->name ?? null,
                'work_day_id' => $advance->work_day_id,
                'amount' => (float) $advance->amount,
                'reason' => $advance->reason,
                'given_on' => $advance->given_on?->toDateString(),
                'settled_at' => $advance->settled_at,
            ])->all(),
            'closing_report' => $this->closing_report,
            'report_snapshot' => $reportSnapshot,
            'closing_balance_actual' => $this->closing_balance_actual !== null ? (float) $this->closing_balance_actual : null,
            'closing_variance' => $this->closing_variance !== null ? (float) $this->closing_variance : null,
            'closing_comment' => $this->closing_comment,
        ];
    }
}
