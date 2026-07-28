<?php

namespace App\Services;

use App\Exceptions\DayAlreadyClosedException;
use App\Exceptions\DayAlreadyOpenException;
use App\Models\Advance;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\WorkDay;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WorkDayService
{
    public function openDay(array $data): WorkDay
    {
        if ($this->getActiveDay() !== null) {
            throw new DayAlreadyOpenException('Une journée est déjà ouverte.');
        }

        return DB::transaction(function () use ($data) {
            $workDay = WorkDay::create([
                'date' => now()->toDateString(),
                'opened_by_user_id' => Auth::id(),
                'opening_balance' => $data['opening_balance'] ?? 0,
                'status' => 'open',
                'notes' => $data['notes'] ?? null,
            ]);

            $employeeIds = $data['employee_ids'] ?? [];

            if (! empty($employeeIds)) {
                $workDay->employees()->attach(
                    collect($employeeIds)->mapWithKeys(fn ($id) => [$id => ['present' => true]])->all()
                );
            }

            return $workDay;
        });
    }

    public function getActiveDay(): ?WorkDay
    {
        return WorkDay::with(['employees', 'openedBy', 'advances.employee'])
            ->where('status', 'open')
            ->first();
    }

    public function closeDay(WorkDay $day): WorkDay
    {
        if ($day->status === 'closed') {
            throw new DayAlreadyClosedException('Cette journée est déjà clôturée.');
        }

        $closingReport = $this->buildClosingReport($day);

        $day->update([
            'status' => 'closed',
            'closed_at' => now(),
            'closing_report' => $closingReport,
        ]);

        return $day->fresh();
    }

    public function buildClosingReport(WorkDay $day): array
    {
        $sales = Sale::where('work_day_id', $day->id)->get();
        $expensesTotal = (float) Expense::where('work_day_id', $day->id)->sum('amount');
        $advancesTotal = (float) Advance::where('work_day_id', $day->id)->sum('amount');

        $revenueTotal = (float) $sales->sum('total');
        $commissionsTotal = (float) $sales->sum(fn (Sale $sale) => (float) ($sale->commission_amount ?? 0));
        $clientsCount = $sales->count();
        $averageTicket = $clientsCount > 0 ? round($revenueTotal / $clientsCount, 2) : 0.0;
        $netResult = round($revenueTotal - $expensesTotal - $advancesTotal - $commissionsTotal, 2);

        $revenueByCategory = $sales
            ->groupBy(fn (Sale $sale) => $sale->category ?? 'autre')
            ->map(function ($group, $category) {
                return [
                    'category' => $category,
                    'total' => round((float) $group->sum('total'), 2),
                    'count' => $group->count(),
                ];
            })
            ->values()
            ->all();

        $revenueByEmployee = $sales
            ->groupBy('employee_id')
            ->map(function ($group, $employeeId) {
                $employee = $group->first()->employee;

                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $employee->name ?? 'Employé',
                    'total' => round((float) $group->sum('total'), 2),
                    'commission' => round((float) $group->sum(fn (Sale $sale) => (float) ($sale->commission_amount ?? 0)), 2),
                    'count' => $group->count(),
                ];
            })
            ->values()
            ->all();

        $topPrestations = SaleItem::whereIn('sale_id', $sales->pluck('id'))
            ->get()
            ->groupBy('label')
            ->map(function ($group, $label) {
                return [
                    'label' => $label,
                    'count' => $group->count(),
                    'total' => round((float) $group->sum(fn (SaleItem $item) => $item->quantity * (float) $item->unit_price), 2),
                ];
            })
            ->sortByDesc('total')
            ->take(8)
            ->values()
            ->all();

        return [
            'revenue_total' => round($revenueTotal, 2),
            'expenses_total' => round($expensesTotal, 2),
            'advances_total' => round($advancesTotal, 2),
            'commissions_total' => round($commissionsTotal, 2),
            'net_result' => $netResult,
            'clients_count' => $clientsCount,
            'average_ticket' => $averageTicket,
            'revenue_by_category' => $revenueByCategory,
            'revenue_by_employee' => $revenueByEmployee,
            'top_prestations' => $topPrestations,
        ];
    }
}
