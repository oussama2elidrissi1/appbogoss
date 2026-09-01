<?php

namespace App\Http\Resources;

use App\Services\WalletService;
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

        // Recomputed from fields already in the snapshot (no extra queries)
        // so already-closed days pick up formula changes immediately —
        // commissions no longer reduce the register's cash result, see
        // WorkDayService::buildDetailedReport().
        if (array_key_exists('revenue_total', $reportSnapshot)) {
            $reportSnapshot['net_result'] = round(
                ($reportSnapshot['revenue_total'] ?? 0)
                    - ($reportSnapshot['expenses_total'] ?? 0)
                    - ($reportSnapshot['advances_total'] ?? 0),
                2,
            );
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
            // Ou est passe le resultat de cette journee : credite au
            // portefeuille de l'admin, hors perimetre (journee anterieure au
            // demarrage du 1er septembre 2026), en attente, ou contre-passe.
            // Purement informatif : aucun montant du rapport n'en depend.
            'wallet' => app(WalletService::class)->workDayStatus(
                $this->resource,
                $reportSnapshot['net_result'] ?? null,
            ),
            'closing_balance_actual' => $this->closing_balance_actual !== null ? (float) $this->closing_balance_actual : null,
            'closing_variance' => $this->closing_variance !== null ? (float) $this->closing_variance : null,
            'closing_comment' => $this->closing_comment,
        ];
    }
}
