<?php

namespace App\Services;

use App\Exceptions\DayAlreadyClosedException;
use App\Exceptions\DayAlreadyOpenException;
use App\Models\Advance;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\WorkDay;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WorkDayService
{
    public function openDay(array $data): WorkDay
    {
        if ($this->getActiveDay() !== null) {
            throw new DayAlreadyOpenException('Une journee est deja ouverte.');
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
            throw new DayAlreadyClosedException('Cette journee est deja cloturee.');
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
        $sales = Sale::withTrashed()
            ->with(['client', 'employee', 'items'])
            ->where('work_day_id', $day->id)
            ->get();
        $expenses = Expense::where('work_day_id', $day->id)->orderBy('spent_on')->get();
        $advances = Advance::with('employee')
            ->where('work_day_id', $day->id)
            ->orderBy('given_on')
            ->get();

        return $this->buildDetailedReport($sales, $expenses, $advances, (float) $day->opening_balance);
    }

    /** Build the complete report for a calendar month, using cash-day dates. */
    public function buildMonthlyReport(string $month): array
    {
        $period = Carbon::createFromFormat('!Y-m', $month);
        $start = $period->copy()->startOfMonth();
        $end = $period->copy()->endOfMonth();
        $days = WorkDay::whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->orderBy('date')
            ->orderBy('id')
            ->get();
        $dayIds = $days->pluck('id');

        $sales = Sale::withTrashed()
            ->with(['client', 'employee', 'items'])
            ->whereIn('work_day_id', $dayIds)
            ->get();
        $expenses = Expense::whereBetween('spent_on', [$start->toDateString(), $end->toDateString()])
            ->orderBy('spent_on')
            ->get();
        $advances = Advance::with('employee')
            ->whereBetween('given_on', [$start->toDateString(), $end->toDateString()])
            ->orderBy('given_on')
            ->get();

        $totals = $this->buildDetailedReport(
            $sales,
            $expenses,
            $advances,
            (float) $days->sum('opening_balance'),
        );

        $daily = $days->map(function (WorkDay $day) use ($sales, $expenses, $advances) {
            $dayReport = $this->buildDetailedReport(
                $sales->where('work_day_id', $day->id)->values(),
                $expenses->where('work_day_id', $day->id)->values(),
                $advances->where('work_day_id', $day->id)->values(),
                (float) $day->opening_balance,
            );

            return [
                'id' => $day->id,
                'date' => $day->date->toDateString(),
                'status' => $day->status,
                'opening_balance' => (float) $day->opening_balance,
                'closed_at' => $day->closed_at,
                'tickets' => $dayReport['ticket_count'],
                'deleted_tickets' => $dayReport['deleted_ticket_count'],
                'revenue_total' => $dayReport['revenue_total'],
                'expenses_total' => $dayReport['expenses_total'],
                'advances_total' => $dayReport['advances_total'],
                'commissions_total' => $dayReport['commissions_total'],
                'net_result' => $dayReport['net_result'],
                'top_prestations' => $dayReport['top_prestations'],
            ];
        })->values()->all();

        return [
            'period' => [
                'month' => $period->format('Y-m'),
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
            ],
            'totals' => $totals,
            'days' => $daily,
        ];
    }

    /** @param Collection<int, Sale> $sales */
    /** @param Collection<int, Expense> $expenses */
    /** @param Collection<int, Advance> $advances */
    protected function buildDetailedReport(
        Collection $sales,
        Collection $expenses,
        Collection $advances,
        float $openingBalance = 0.0,
    ): array {
        $activeSales = $sales->filter(fn (Sale $sale) => ! $sale->trashed())->values();
        $deletedSales = $sales->filter(fn (Sale $sale) => $sale->trashed())->values();
        $revenueTotal = (float) $activeSales->sum('total');
        $expensesTotal = (float) $expenses->sum('amount');
        $advancesTotal = (float) $advances->sum('amount');
        $commissionsTotal = (float) $activeSales->sum(
            fn (Sale $sale) => (float) ($sale->commission_amount ?? 0),
        );
        $clientsCount = $activeSales->count();
        $averageTicket = $clientsCount > 0 ? round($revenueTotal / $clientsCount, 2) : 0.0;
        $netResult = round($revenueTotal - $expensesTotal - $advancesTotal - $commissionsTotal, 2);

        $revenueByCategory = $activeSales
            ->groupBy(fn (Sale $sale) => $sale->category ?? 'autre')
            ->map(fn (Collection $group, $category) => [
                'category' => $category,
                'total' => round((float) $group->sum('total'), 2),
                'count' => $group->count(),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();

        $employeeGroups = $activeSales->groupBy(fn (Sale $sale) => $sale->employee_id ?? 0);
        $revenueByEmployee = $employeeGroups
            ->map(function (Collection $group, $employeeId) {
                $employee = $group->first()->employee;

                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $employee->name ?? 'Employe',
                    'total' => round((float) $group->sum('total'), 2),
                    'commission' => round((float) $group->sum(
                        fn (Sale $sale) => (float) ($sale->commission_amount ?? 0),
                    ), 2),
                    'count' => $group->count(),
                    'prestations' => $this->prestationRows($group),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        $prestationGroups = $activeSales
            ->flatMap(fn (Sale $sale) => $sale->items->map(fn (SaleItem $item) => [
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
                'total' => (float) $item->quantity * (float) $item->unit_price,
                'employee_id' => $sale->employee_id,
                'employee_name' => $sale->employee->name ?? 'Employe',
            ]))
            ->groupBy('label');
        $topPrestations = $this->prestationRowsFromItems($prestationGroups)
            ->sortByDesc('total')
            ->values()
            ->all();

        $prestationByEmployee = $prestationGroups
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum('total'), 2),
                'employees' => $group->groupBy(fn (array $row) => $row['employee_id'] ?? 0)
                    ->map(fn (Collection $employeeRows, $employeeId) => [
                        'employee_id' => (int) $employeeId,
                        'employee_name' => $employeeRows->first()['employee_name'] ?? 'Employe',
                        'count' => (int) $employeeRows->sum('quantity'),
                        'total' => round((float) $employeeRows->sum('total'), 2),
                    ])
                    ->sortByDesc('total')
                    ->values()
                    ->all(),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();

        $expensesByCategory = $expenses
            ->groupBy(fn (Expense $expense) => $expense->category ?: 'general')
            ->map(fn (Collection $group, $category) => [
                'category' => $category,
                'count' => $group->count(),
                'total' => round((float) $group->sum('amount'), 2),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();

        $advancesByEmployee = $advances
            ->groupBy(fn (Advance $advance) => $advance->employee_id)
            ->map(function (Collection $group, $employeeId) {
                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $group->first()->employee->name ?? 'Employe',
                    'count' => $group->count(),
                    'total' => round((float) $group->sum('amount'), 2),
                    'settled_total' => round((float) $group->filter(
                        fn (Advance $advance) => $advance->settled_at !== null,
                    )->sum('amount'), 2),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        $paymentMethods = $activeSales
            ->groupBy(fn (Sale $sale) => $sale->payment_method ?: 'especes')
            ->map(fn (Collection $group, $method) => [
                'method' => $method,
                'count' => $group->count(),
                'total' => round((float) $group->sum('total'), 2),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();

        return [
            'opening_balance' => round($openingBalance, 2),
            'revenue_total' => round($revenueTotal, 2),
            'expenses_total' => round($expensesTotal, 2),
            'advances_total' => round($advancesTotal, 2),
            'commissions_total' => round($commissionsTotal, 2),
            'net_result' => $netResult,
            'cash_expected' => round($openingBalance + $revenueTotal - $expensesTotal - $advancesTotal, 2),
            'clients_count' => $clientsCount,
            'average_ticket' => $averageTicket,
            'ticket_count' => $activeSales->count(),
            'deleted_ticket_count' => $deletedSales->count(),
            'deleted_ticket_total' => round((float) $deletedSales->sum('total'), 2),
            'print_count' => (int) $sales->sum(fn (Sale $sale) => (int) ($sale->print_count ?? 0)),
            'printed_ticket_count' => (int) $sales->sum(
                fn (Sale $sale) => ((int) ($sale->print_count ?? 0)) * 2,
            ),
            'revenue_by_category' => $revenueByCategory,
            'revenue_by_employee' => $revenueByEmployee,
            'employee_by_prestation' => $revenueByEmployee,
            'prestation_by_employee' => $prestationByEmployee,
            'top_prestations' => array_slice($topPrestations, 0, 12),
            'expenses_by_category' => $expensesByCategory,
            'expense_details' => $expenses->map(fn (Expense $expense) => [
                'id' => $expense->id,
                'label' => $expense->label,
                'category' => $expense->category,
                'amount' => (float) $expense->amount,
                'spent_on' => $expense->spent_on?->toDateString(),
            ])->values()->all(),
            'advances_by_employee' => $advancesByEmployee,
            'advance_details' => $advances->map(fn (Advance $advance) => [
                'id' => $advance->id,
                'employee_id' => $advance->employee_id,
                'employee_name' => $advance->employee->name ?? 'Employe',
                'amount' => (float) $advance->amount,
                'reason' => $advance->reason,
                'given_on' => $advance->given_on?->toDateString(),
                'settled_at' => $advance->settled_at,
            ])->values()->all(),
            'payment_methods' => $paymentMethods,
            'ticket_details' => $sales->map(fn (Sale $sale) => [
                'id' => $sale->id,
                'created_at' => $sale->created_at?->toIso8601String(),
                'employee_id' => $sale->employee_id,
                'employee_name' => $sale->employee->name ?? 'Employe',
                'client_name' => $sale->client?->name ?? $sale->client_label ?? 'Client de passage',
                'category' => $sale->category,
                'label' => $sale->items->pluck('label')->implode(', '),
                'total' => (float) $sale->total,
                'print_count' => (int) ($sale->print_count ?? 0),
                'printed_ticket_count' => (int) ($sale->print_count ?? 0) * 2,
                'is_deleted' => $sale->trashed(),
            ])->values()->all(),
        ];
    }

    protected function prestationRows(Collection $sales): array
    {
        return $this->prestationRowsFromItems(
            $sales->flatMap(fn (Sale $sale) => $sale->items->map(fn (SaleItem $item) => [
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
                'total' => (float) $item->quantity * (float) $item->unit_price,
            ]))->groupBy('label'),
        )->sortByDesc('total')->values()->all();
    }

    protected function prestationRowsFromItems(Collection $groups): Collection
    {
        return $groups->map(fn (Collection $group, $label) => [
            'label' => $label,
            'count' => (int) $group->sum('quantity'),
            'total' => round((float) $group->sum('total'), 2),
        ]);
    }
}
