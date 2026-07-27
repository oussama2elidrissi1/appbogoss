<?php

namespace App\Services;

use App\DTOs\DashboardStatsDTO;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\WorkDay;
use Carbon\Carbon;

class DashboardService
{
    public function getStats(): DashboardStatsDTO
    {
        return new DashboardStatsDTO(
            kpis: $this->buildKpis(),
            revenueSeries: $this->buildRevenueSeries(),
            lowStockProducts: $this->buildLowStockProducts(),
            recentActivity: $this->buildRecentActivity(),
            appointmentQueue: $this->buildAppointmentQueue(),
            activeDay: $this->buildActiveDay(),
        );
    }

    protected function buildKpis(): array
    {
        $today = Carbon::today();
        $yesterday = Carbon::yesterday();
        $monthStart = Carbon::today()->startOfMonth();

        $revenueToday = (float) Sale::whereDate('created_at', $today)->sum('total');
        $revenueYesterday = (float) Sale::whereDate('created_at', $yesterday)->sum('total');
        $revenueMonth = (float) Sale::where('created_at', '>=', $monthStart)->sum('total');

        $appointmentsToday = Appointment::whereDate('starts_at', $today)->count();
        $appointmentsYesterday = Appointment::whereDate('starts_at', $yesterday)->count();

        $clientsTotal = Client::count();
        $clientsNewThisMonth = Client::where('created_at', '>=', $monthStart)->count();

        $employeesActive = Employee::where('is_active', true)->count();

        $expensesMonth = (float) Expense::where('spent_on', '>=', $monthStart->toDateString())->sum('amount');

        $clientsToday = Sale::whereDate('created_at', $today)
            ->whereNotNull('client_id')
            ->distinct('client_id')
            ->count('client_id');

        return [
            'revenue_today' => $revenueToday,
            'revenue_month' => $revenueMonth,
            'revenue_trend_pct' => $this->trendPct($revenueToday, $revenueYesterday),
            'appointments_today' => $appointmentsToday,
            'appointments_trend_pct' => $this->trendPct($appointmentsToday, $appointmentsYesterday),
            'clients_total' => $clientsTotal,
            'clients_new_this_month' => $clientsNewThisMonth,
            'employees_active' => $employeesActive,
            'expenses_month' => $expensesMonth,
            'clients_today' => $clientsToday,
        ];
    }

    protected function buildActiveDay(): ?array
    {
        $day = WorkDay::where('status', 'open')->first();

        if ($day === null) {
            return null;
        }

        $revenueSoFar = (float) Sale::where('work_day_id', $day->id)->sum('total');
        $expensesSoFar = (float) Expense::where('work_day_id', $day->id)->sum('amount');
        $commissionsSoFar = (float) Sale::where('work_day_id', $day->id)->sum('commission_amount');
        $employeesPresent = $day->employees()->wherePivot('present', true)->count();

        return [
            'id' => $day->id,
            'date' => $day->date->toDateString(),
            'opening_balance' => (float) $day->opening_balance,
            'employees_present' => $employeesPresent,
            'revenue_so_far' => round($revenueSoFar, 2),
            'expenses_so_far' => round($expensesSoFar, 2),
            'commissions_so_far' => round($commissionsSoFar, 2),
            'estimated_profit' => round($revenueSoFar - $expensesSoFar - $commissionsSoFar, 2),
        ];
    }

    protected function trendPct(float $current, float $previous): float
    {
        if ($previous == 0.0) {
            return 0.0;
        }

        return round((($current - $previous) / $previous) * 100, 2);
    }

    protected function buildRevenueSeries(): array
    {
        $start = Carbon::today()->subDays(13);
        $end = Carbon::today();

        $revenueByDay = Sale::where('created_at', '>=', $start->copy()->startOfDay())
            ->selectRaw('DATE(created_at) as day, SUM(total) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $expensesByDay = Expense::where('spent_on', '>=', $start->toDateString())
            ->selectRaw('spent_on as day, SUM(amount) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        $cursor = $start->copy();

        while ($cursor->lte($end)) {
            $key = $cursor->toDateString();

            $series[] = [
                'date' => $key,
                'revenue' => (float) ($revenueByDay[$key] ?? 0),
                'expenses' => (float) ($expensesByDay[$key] ?? 0),
            ];

            $cursor->addDay();
        }

        return $series;
    }

    protected function buildLowStockProducts(): array
    {
        return Product::lowStock()
            ->orderBy('stock_quantity', 'asc')
            ->limit(6)
            ->get()
            ->map(fn (Product $product) => [
                'id' => $product->id,
                'name' => $product->name,
                'stock_quantity' => $product->stock_quantity,
                'low_stock_threshold' => $product->low_stock_threshold,
                'category' => $product->category,
            ])
            ->all();
    }

    protected function buildRecentActivity(): array
    {
        $sales = Sale::with('client')
            ->latest('created_at')
            ->limit(8)
            ->get()
            ->map(function (Sale $sale) {
                $clientName = $sale->client->name ?? 'Client anonyme';

                return [
                    'id' => $sale->id,
                    'type' => 'sale',
                    'label' => 'Vente encaissée',
                    'description' => sprintf('%s - %s €', $clientName, number_format((float) $sale->total, 2)),
                    'amount' => (float) $sale->total,
                    'created_at' => $sale->created_at->toIso8601String(),
                ];
            });

        $appointments = Appointment::with(['service', 'employee'])
            ->whereIn('status', ['completed', 'confirmed'])
            ->latest('created_at')
            ->limit(8)
            ->get()
            ->map(function (Appointment $appointment) {
                $serviceName = $appointment->service->name ?? 'Service';
                $employeeName = $appointment->employee->name ?? 'Employé';

                return [
                    'id' => $appointment->id,
                    'type' => 'appointment',
                    'label' => 'Nouveau rendez-vous',
                    'description' => sprintf('%s avec %s', $serviceName, $employeeName),
                    'amount' => null,
                    'created_at' => $appointment->created_at->toIso8601String(),
                ];
            });

        $clients = Client::latest('created_at')
            ->limit(8)
            ->get()
            ->map(fn (Client $client) => [
                'id' => $client->id,
                'type' => 'client',
                'label' => 'Nouveau client',
                'description' => $client->name,
                'amount' => null,
                'created_at' => $client->created_at->toIso8601String(),
            ]);

        return $sales
            ->concat($appointments)
            ->concat($clients)
            ->sortByDesc('created_at')
            ->take(8)
            ->values()
            ->all();
    }

    protected function buildAppointmentQueue(): array
    {
        return Appointment::with(['client', 'service', 'employee'])
            ->whereDate('starts_at', Carbon::today())
            ->whereIn('status', ['confirmed', 'pending'])
            ->orderBy('starts_at', 'asc')
            ->limit(8)
            ->get()
            ->map(fn (Appointment $appointment) => [
                'id' => $appointment->id,
                'client_name' => $appointment->client->name ?? 'Client',
                'service_name' => $appointment->service->name ?? 'Service',
                'employee_name' => $appointment->employee->name ?? 'Employé',
                'starts_at' => $appointment->starts_at->toIso8601String(),
                'status' => $appointment->status,
                'service_color' => $appointment->service->color ?? '#C8A24C',
            ])
            ->all();
    }
}
