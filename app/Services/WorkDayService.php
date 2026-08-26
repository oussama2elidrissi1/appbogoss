<?php

namespace App\Services;

use App\Exceptions\DayAlreadyClosedException;
use App\Exceptions\DayAlreadyOpenException;
use App\Models\Advance;
use App\Models\CashMovement;
use App\Models\Commission;
use App\Models\Expense;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\WorkDay;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WorkDayService
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

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

            $this->activityLogger->log('caisse.opened', $workDay, [], ['opening_balance' => $workDay->opening_balance]);

            return $workDay;
        });
    }

    public function getActiveDay(): ?WorkDay
    {
        return WorkDay::with(['employees', 'openedBy', 'advances.employee'])
            ->where('status', 'open')
            ->first();
    }

    public function closeDay(WorkDay $day, ?float $actualBalance = null, ?string $comment = null): WorkDay
    {
        if ($day->status === 'closed') {
            throw new DayAlreadyClosedException('Cette journee est deja cloturee.');
        }

        $closingReport = $this->buildClosingReport($day);
        $variance = $actualBalance !== null ? round($actualBalance - $closingReport['cash_expected'], 2) : null;

        $day->update([
            'status' => 'closed',
            'closed_at' => now(),
            'closing_report' => $closingReport,
            'closing_balance_actual' => $actualBalance,
            'closing_variance' => $variance,
            'closing_comment' => $comment,
        ]);

        $this->activityLogger->log('caisse.closed', $day, [], [
            'closing_balance_actual' => $actualBalance,
            'closing_variance' => $variance,
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
        $cashMovements = CashMovement::where('work_day_id', $day->id)->orderBy('created_at')->get();

        return $this->buildDetailedReport($sales, $expenses, $advances, (float) $day->opening_balance, $cashMovements);
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
        $cashMovements = CashMovement::whereIn('work_day_id', $dayIds)->get();

        $totals = $this->buildDetailedReport(
            $sales,
            $expenses,
            $advances,
            (float) $days->sum('opening_balance'),
            $cashMovements,
        );

        $daily = $days->map(function (WorkDay $day) use ($sales, $expenses, $advances, $cashMovements) {
            $dayReport = $this->buildDetailedReport(
                $sales->where('work_day_id', $day->id)->values(),
                $expenses->where('work_day_id', $day->id)->values(),
                $advances->where('work_day_id', $day->id)->values(),
                (float) $day->opening_balance,
                $cashMovements->where('work_day_id', $day->id)->values(),
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
    /** @param Collection<int, CashMovement> $cashMovements */
    protected function buildDetailedReport(
        Collection $sales,
        Collection $expenses,
        Collection $advances,
        float $openingBalance = 0.0,
        ?Collection $cashMovements = null,
    ): array {
        $cashMovements ??= collect();
        $activeSales = $sales->filter(fn (Sale $sale) => ! $sale->trashed())->values();
        $deletedSales = $sales->filter(fn (Sale $sale) => $sale->trashed())->values();
        $revenueTotal = (float) $activeSales->sum('total');
        $expensesTotal = (float) $expenses->sum('amount');
        $advancesTotal = (float) $advances->sum('amount');
        $cashInTotal = (float) $cashMovements->where('type', 'in')->sum('amount');
        $cashOutTotal = (float) $cashMovements->where('type', 'out')->sum('amount');
        $commissionsTotal = (float) $activeSales->sum(
            fn (Sale $sale) => (float) ($sale->commission_amount ?? 0),
        );
        $clientsCount = $activeSales->count();
        $averageTicket = $clientsCount > 0 ? round($revenueTotal / $clientsCount, 2) : 0.0;
        // Cash result of the register — commissions are a monthly payroll
        // concern settled on the "Paie" page, not money that leaves the
        // till day-to-day, so they no longer reduce this figure. commissions_total
        // is still returned below for whatever still needs the raw figure.
        $netResult = round($revenueTotal - $expensesTotal - $advancesTotal, 2);

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

        $saleRevenueRows = $this->saleRevenueRows($activeSales);
        $revenueByEmployee = $saleRevenueRows
            ->groupBy(fn (array $row) => $row['employee_id'] ?? 0)
            ->map(function (Collection $group, $employeeId) {
                return [
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $group->first()['employee_name'] ?? 'Employe',
                    'total' => round((float) $group->sum('total'), 2),
                    'commission' => round((float) $group->sum('commission'), 2),
                    'count' => (int) $group->sum('quantity'),
                    'prestations' => $this->prestationRowsFromItems($group->groupBy('label'))
                        ->sortByDesc('total')
                        ->values()
                        ->all(),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        $prestationGroups = $saleRevenueRows
            ->filter(fn (array $row) => (int) $row['quantity'] > 0 || (float) $row['total'] > 0)
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
            'cash_in_total' => round($cashInTotal, 2),
            'cash_out_total' => round($cashOutTotal, 2),
            'cash_expected' => round($openingBalance + $revenueTotal - $expensesTotal - $advancesTotal + $cashInTotal - $cashOutTotal, 2),
            'cash_movements' => $cashMovements->map(fn (CashMovement $movement) => [
                'id' => $movement->id,
                'type' => $movement->type,
                'amount' => (float) $movement->amount,
                'label' => $movement->label,
                'user_name' => $movement->user->name ?? null,
                'created_at' => $movement->created_at?->toIso8601String(),
            ])->values()->all(),
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

    /**
     * Revenue allocation rows used by both "CA par employé" and
     * "prestations par employé". Linked Prestation tickets are split by
     * their real line employees; legacy quick-sales keep the Sale employee.
     *
     * @param  Collection<int, Sale>  $sales
     * @return Collection<int, array<string, mixed>>
     */
    protected function saleRevenueRows(Collection $sales): Collection
    {
        $prestationsBySaleId = Prestation::with(['employee', 'items.employee', 'items.service', 'commissions.employee'])
            ->whereIn('sale_id', $sales->pluck('id')->filter()->values())
            ->get()
            ->keyBy('sale_id');

        return $sales->flatMap(function (Sale $sale) use ($prestationsBySaleId) {
            $prestation = $prestationsBySaleId->get($sale->id);

            if ($prestation instanceof Prestation) {
                return $this->prestationSaleRevenueRows($sale, $prestation);
            }

            $rows = $sale->items->values()->map(function (SaleItem $item, int $index) use ($sale) {
                return [
                    'sale_id' => $sale->id,
                    'label' => $item->label,
                    'quantity' => (int) $item->quantity,
                    'total' => (float) $item->quantity * (float) $item->unit_price,
                    'commission' => $index === 0 ? (float) ($sale->commission_amount ?? 0) : 0.0,
                    'employee_id' => $sale->employee_id,
                    'employee_name' => $sale->employee->name ?? 'Employe',
                ];
            });

            if ($rows->isEmpty()) {
                return [[
                    'sale_id' => $sale->id,
                    'label' => $sale->category ?? 'Vente',
                    'quantity' => 1,
                    'total' => (float) $sale->total,
                    'commission' => (float) ($sale->commission_amount ?? 0),
                    'employee_id' => $sale->employee_id,
                    'employee_name' => $sale->employee->name ?? 'Employe',
                ]];
            }

            return $rows;
        })->values();
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    protected function prestationSaleRevenueRows(Sale $sale, Prestation $prestation): Collection
    {
        $saleItems = $sale->items->values();
        $rows = $prestation->items->values()->map(function (PrestationItem $item, int $index) use ($sale, $saleItems, $prestation) {
            $employee = $item->employee ?? $prestation->employee ?? $sale->employee;
            $saleItem = $saleItems->get($index);

            return [
                'sale_id' => $sale->id,
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
                'total' => $saleItem !== null
                    ? (float) $saleItem->quantity * (float) $saleItem->unit_price
                    : (float) $item->effectiveLineTotal(),
                'commission' => 0.0,
                'employee_id' => $employee?->id,
                'employee_name' => $employee->name ?? 'Employe',
            ];
        });

        $allocatedTotal = (float) $rows->sum('total');
        $difference = round((float) $sale->total - $allocatedTotal, 2);
        if (abs($difference) >= 0.01 && $rows->isNotEmpty()) {
            $rows = $rows->values();
            $first = $rows->first();
            $first['total'] = round((float) $first['total'] + $difference, 2);
            $rows->put(0, $first);
        }

        $commissionTotals = $prestation->commissions->isNotEmpty()
            ? $prestation->commissions
                ->where('status', Commission::STATUS_VALIDATED)
                ->groupBy('employee_id')
                ->map(fn (Collection $commissions) => (float) $commissions->sum('amount'))
            : $prestation->items
                ->groupBy(fn (PrestationItem $item) => $item->employee_id ?? $prestation->employee_id ?? $sale->employee_id)
                ->map(fn (Collection $items) => (float) $items->sum('commission_amount'));

        foreach ($commissionTotals as $employeeId => $commission) {
            $index = $rows->search(fn (array $row) => (int) ($row['employee_id'] ?? 0) === (int) $employeeId);

            if ($index === false) {
                $commissionEmployee = $prestation->commissions
                    ->firstWhere('employee_id', (int) $employeeId)
                    ?->employee;

                $rows->push([
                    'sale_id' => $sale->id,
                    'label' => 'Commission',
                    'quantity' => 0,
                    'total' => 0.0,
                    'commission' => (float) $commission,
                    'employee_id' => (int) $employeeId,
                    'employee_name' => $commissionEmployee->name ?? 'Employe',
                ]);

                continue;
            }

            $row = $rows->get($index);
            $row['commission'] = round((float) $row['commission'] + (float) $commission, 2);
            $rows->put($index, $row);
        }

        return $rows->values();
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
