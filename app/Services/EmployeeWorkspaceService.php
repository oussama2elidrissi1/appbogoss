<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Appointment;
use App\Models\AppointmentReview;
use App\Models\Advance;
use App\Models\Client;
use App\Models\Commission;
use App\Models\CommissionPayout;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class EmployeeWorkspaceService
{
    public function __construct(
        private readonly EmployeeEarningsService $earnings,
        private readonly CommissionPayoutService $payouts,
    ) {
    }

    public function dashboard(Employee $employee): array
    {
        $today = Carbon::today();
        $yesterday = Carbon::yesterday();
        $monthStart = Carbon::now()->startOfMonth();

        $todayPrestations = $this->prestations($employee)
            ->whereDate('created_at', $today)
            ->with(['items', 'client'])
            ->get();
        $yesterdayPrestations = $this->prestations($employee)
            ->whereDate('created_at', $yesterday)
            ->count();

        $paidToday = $todayPrestations->where('status', Prestation::STATUS_PAID);
        $appointmentsToday = $this->appointmentRows($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay());
        $upcomingAppointments = $appointmentsToday
            ->filter(fn (array $row) => Carbon::parse($row['starts_at'])->gte(now()) && ! in_array($row['status'], ['cancelled', 'refused', 'no_show'], true))
            ->values();

        $commissionsToday = $this->commissionSum($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay());
        $monthPreview = $this->payouts->preview($employee, Carbon::now()->format('Y-m'));

        $distribution = $this->serviceDistribution($employee, $monthStart, Carbon::now()->endOfDay());
        $reviews = $this->reviewSummary($employee);

        return [
            'employee' => $this->employeeCard($employee),
            'today' => [
                'date' => now()->toIso8601String(),
                'prestations_count' => $todayPrestations->count() + $appointmentsToday->count(),
                'prestations_delta' => $todayPrestations->count() - $yesterdayPrestations,
                'revenue' => round((float) $paidToday->sum('total'), 2),
                'commission' => round($commissionsToday, 2),
                'monthly_commission' => $monthPreview['commission_total'],
                'paid_commission' => $monthPreview['paid_net_total'],
            ],
            'prestations_today' => $todayPrestations
                ->sortBy('created_at')
                ->values()
                ->map(fn (Prestation $prestation) => $this->prestationRow($prestation))
                ->all(),
            'agenda_today' => $appointmentsToday->values()->all(),
            'next_appointment' => $upcomingAppointments->first(),
            'commission_evolution' => $this->commissionEvolution($employee, '7d'),
            'service_distribution' => $distribution,
            'top_services' => $this->topServices($employee, $monthStart, Carbon::now()->endOfDay())->take(5)->values()->all(),
            'reviews' => $reviews,
            'daily_tip' => AppSetting::where('key', 'employee_daily_tip')->value('value')
                ?: 'Restez ponctuel et offrez toujours la meilleure experience a vos clients.',
        ];
    }

    public function prestationRows(Employee $employee, array $filters): array
    {
        $query = $this->prestations($employee)->with(['items', 'client', 'commissions']);

        if (! empty($filters['from'])) {
            $query->whereDate('created_at', '>=', $filters['from']);
        }
        if (! empty($filters['to'])) {
            $query->whereDate('created_at', '<=', $filters['to']);
        }
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['service_id'])) {
            $query->whereHas('items', fn (Builder $builder) => $builder->where('service_id', $filters['service_id']));
        }
        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('client_label', 'like', "%{$search}%")
                    ->orWhereHas('client', fn (Builder $client) => $client->where('name', 'like', "%{$search}%"));
            });
        }

        return $query->orderByDesc('created_at')
            ->limit(250)
            ->get()
            ->map(fn (Prestation $prestation) => $this->prestationRow($prestation))
            ->all();
    }

    public function commissions(Employee $employee, array $filters): array
    {
        $query = Commission::where('employee_id', $employee->id)
            ->with(['prestation.client', 'service'])
            ->orderByDesc('created_at');

        if (! empty($filters['from'])) {
            $query->whereDate('created_at', '>=', $filters['from']);
        }
        if (! empty($filters['to'])) {
            $query->whereDate('created_at', '<=', $filters['to']);
        }
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        $rows = $query->limit(300)->get()->map(fn (Commission $commission) => [
            'id' => $commission->id,
            'date' => $commission->created_at?->toIso8601String(),
            'client_name' => $commission->prestation?->client?->name ?? $commission->prestation?->client_label ?? 'Client de passage',
            'service_name' => $commission->service?->name ?? 'Service',
            'service_price' => (float) $commission->base_amount,
            'type' => $commission->type,
            'amount' => (float) $commission->amount,
            'status' => $commission->status,
        ])->all();

        $today = Carbon::today();
        $weekStart = Carbon::now()->startOfWeek();
        $monthStart = Carbon::now()->startOfMonth();
        $monthPreview = $this->payouts->preview($employee, Carbon::now()->format('Y-m'));

        return [
            'summary' => [
                'today' => round($this->commissionSum($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay()), 2),
                'week' => round($this->commissionSum($employee, $weekStart, Carbon::now()->endOfDay()), 2),
                'month' => $monthPreview['commission_total'],
                'validated' => $monthPreview['commission_total'],
                'paid' => $monthPreview['paid_net_total'],
                'pending' => $monthPreview['net_amount'],
            ],
            'evolution' => $this->commissionEvolution($employee, $filters['range'] ?? 'month'),
            'rows' => $rows,
            'advances' => Advance::where('employee_id', $employee->id)
                ->with(['workDay', 'commissionPayout'])
                ->orderByDesc('given_on')
                ->orderByDesc('id')
                ->get()
                ->map(fn (Advance $advance) => [
                    'id' => $advance->id,
                    'amount' => (float) $advance->amount,
                    'reason' => $advance->reason,
                    'given_on' => $advance->given_on?->toDateString(),
                    'settled_at' => $advance->settled_at?->toIso8601String(),
                    'work_day_date' => $advance->workDay?->date?->toDateString(),
                    'commission_payout_period' => $advance->commissionPayout?->period,
                ])
                ->all(),
            'payouts' => CommissionPayout::where('employee_id', $employee->id)
                ->with('paidBy')
                ->orderByDesc('paid_at')
                ->get()
                ->map(fn (CommissionPayout $payout) => [
                    'id' => $payout->id,
                    'period' => $payout->period,
                    'commission_total' => (float) $payout->commission_total,
                    'advances_deducted' => (float) $payout->advances_deducted,
                    'net_amount' => (float) $payout->net_amount,
                    'paid_at' => $payout->paid_at?->toIso8601String(),
                    'paid_by' => $payout->paidBy?->name,
                ])
                ->all(),
        ];
    }

    public function statistics(Employee $employee, array $filters): array
    {
        [$from, $to] = $this->period($filters['period'] ?? 'month', $filters['from'] ?? null, $filters['to'] ?? null);
        $prestations = $this->prestations($employee)
            ->whereBetween('created_at', [$from, $to])
            ->with(['items', 'client'])
            ->get();
        $paid = $prestations->where('status', Prestation::STATUS_PAID);
        $reviews = AppointmentReview::where('employee_id', $employee->id)->whereBetween('reviewed_at', [$from, $to])->get();

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'prestations' => $prestations->count(),
                'revenue' => round((float) $paid->sum('total'), 2),
                'commission_generated' => round($this->commissionSum($employee, $from, $to), 2),
                'commission_paid' => round((float) CommissionPayout::where('employee_id', $employee->id)->whereBetween('paid_at', [$from, $to])->sum('net_amount'), 2),
                'average_rating' => $reviews->count() > 0 ? round((float) $reviews->avg('rating'), 1) : null,
                'clients_served' => $paid->pluck('client_id')->filter()->unique()->count(),
                'average_duration' => round((float) $prestations->flatMap->items->avg('duration_minutes'), 0),
            ],
            'commission_evolution' => $this->commissionEvolution($employee, $filters['range'] ?? 'month', $from, $to),
            'service_distribution' => $this->serviceDistribution($employee, $from, $to),
            'top_services' => $this->topServices($employee, $from, $to)->values()->all(),
            'active_days' => $prestations
                ->groupBy(fn (Prestation $prestation) => $prestation->created_at?->locale('fr')->isoFormat('dddd') ?? '')
                ->map(fn (Collection $group, string $day) => ['day' => ucfirst($day), 'count' => $group->count()])
                ->values()
                ->all(),
        ];
    }

    public function clients(Employee $employee): array
    {
        $prestations = $this->prestations($employee)
            ->whereNotNull('client_id')
            ->with(['client', 'items'])
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('client_id');

        return $prestations->map(function (Collection $group) {
            /** @var Prestation $latest */
            $latest = $group->sortByDesc('created_at')->first();
            $services = $group->flatMap->items
                ->groupBy('label')
                ->map(fn (Collection $items, string $label) => ['label' => $label, 'count' => (int) $items->sum('quantity')])
                ->sortByDesc('count')
                ->take(3)
                ->values();

            return [
                'id' => $latest->client?->id,
                'name' => $latest->client?->name,
                'phone' => $latest->client?->phone,
                'avatar_color' => $latest->client?->avatar_color,
                'prestations_count' => $group->count(),
                'last_visit_at' => $latest->created_at?->toIso8601String(),
                'usual_services' => $services->all(),
                'notes' => $latest->client?->notes,
            ];
        })->values()->all();
    }

    public function reviews(Employee $employee): array
    {
        $summary = $this->reviewSummary($employee);
        $rows = AppointmentReview::where('employee_id', $employee->id)
            ->with('client')
            ->orderByDesc('reviewed_at')
            ->limit(100)
            ->get()
            ->map(fn (AppointmentReview $review) => [
                'id' => $review->id,
                'client_name' => $review->client?->name ?? 'Client',
                'rating' => $review->rating,
                'comment' => $review->comment,
                'reviewed_at' => $review->reviewed_at?->toIso8601String(),
            ])
            ->all();

        return ['summary' => $summary, 'rows' => $rows];
    }

    public function agenda(Employee $employee, Carbon $from, Carbon $to): array
    {
        return $this->appointmentRows($employee, $from, $to)->values()->all();
    }

    public function appointment(Employee $employee, Appointment $appointment): array
    {
        abort_unless($this->appointmentBelongsToEmployee($appointment, $employee), 403, 'Ce rendez-vous ne vous appartient pas.');

        $appointment->load(['client', 'service', 'partner']);

        return $this->appointmentRow($appointment);
    }

    public function documents(Employee $employee): array
    {
        return [
            'documents' => [],
            'empty_state' => 'Aucun document employe autorise pour le moment.',
        ];
    }

    private function prestations(Employee $employee): Builder
    {
        return Prestation::query()->where('employee_id', $employee->id);
    }

    private function employeeCard(Employee $employee): array
    {
        return [
            'id' => $employee->id,
            'name' => $employee->name,
            'role' => $employee->role,
            'avatar_color' => $employee->avatar_color,
            'specialties' => $employee->specialties ?? [],
        ];
    }

    private function prestationRow(Prestation $prestation): array
    {
        $prestation->loadMissing(['items', 'client', 'commissions']);

        return [
            'id' => $prestation->id,
            'reference' => $prestation->reference,
            'date' => $prestation->created_at?->toIso8601String(),
            'time' => $prestation->created_at?->format('H:i'),
            'client_id' => $prestation->client_id,
            'client_name' => $prestation->client?->name ?? $prestation->client_label ?? 'Client de passage',
            'client_phone' => $prestation->client?->phone,
            'service' => $prestation->items->pluck('label')->join(' + '),
            'duration_minutes' => (int) $prestation->items->sum('duration_minutes'),
            'amount' => (float) $prestation->total,
            'commission' => round((float) $prestation->commissions->sum('amount'), 2),
            'status' => $prestation->status,
        ];
    }

    private function appointmentRows(Employee $employee, Carbon $from, Carbon $to): Collection
    {
        return Appointment::query()
            ->whereBetween('starts_at', [$from, $to])
            ->with(['client', 'service', 'partner'])
            ->orderBy('starts_at')
            ->get()
            ->filter(fn (Appointment $appointment) => $this->appointmentBelongsToEmployee($appointment, $employee))
            ->map(fn (Appointment $appointment) => $this->appointmentRow($appointment))
            ->values();
    }

    private function appointmentBelongsToEmployee(Appointment $appointment, Employee $employee): bool
    {
        if ((int) $appointment->employee_id === (int) $employee->id) {
            return true;
        }

        return collect($appointment->reservation_items ?: [])
            ->contains(fn (array $item) => isset($item['employee_id']) && (int) $item['employee_id'] === (int) $employee->id);
    }

    private function appointmentRow(Appointment $appointment): array
    {
        $items = collect($appointment->reservation_items ?: [[
            'service_id' => $appointment->service_id,
            'employee_id' => $appointment->employee_id,
            'duration_minutes_snapshot' => $appointment->service?->duration_minutes,
            'price_snapshot' => $appointment->service?->price,
        ]]);
        $serviceNames = $appointment->relationLoaded('service') && $appointment->service
            ? [$appointment->service->name]
            : [];

        return [
            'id' => $appointment->id,
            'client_id' => $appointment->client_id,
            'client_name' => $appointment->client?->name ?? 'Client',
            'client_phone' => $appointment->client?->phone,
            'starts_at' => $appointment->starts_at?->toIso8601String(),
            'ends_at' => $appointment->ends_at?->toIso8601String(),
            'time' => $appointment->starts_at?->format('H:i'),
            'service' => implode(' + ', array_filter($serviceNames)) ?: 'Prestation',
            'services' => $items->values()->all(),
            'duration_minutes' => $appointment->starts_at && $appointment->ends_at ? $appointment->starts_at->diffInMinutes($appointment->ends_at) : 0,
            'amount' => round((float) $items->sum(fn (array $item) => (float) ($item['price_snapshot'] ?? 0)), 2),
            'status' => $appointment->status,
            'notes' => $appointment->notes,
            'origin' => $appointment->partner_id ? 'Reservation partenaire' : 'Reservation BOGOSLAND',
        ];
    }

    private function commissionSum(Employee $employee, Carbon $from, Carbon $to, ?string $status = null): float
    {
        if ($status === null || $status === Commission::STATUS_VALIDATED) {
            return $this->earnings->commissionEarnedTotal($employee, $from, $to);
        }

        return (float) Commission::where('employee_id', $employee->id)
            ->when($status, fn (Builder $query) => $query->where('status', $status))
            ->whereBetween('created_at', [$from, $to])
            ->sum('amount');
    }

    private function commissionEvolution(Employee $employee, string $range, ?Carbon $from = null, ?Carbon $to = null): array
    {
        [$from, $to] = $from && $to ? [$from, $to] : $this->period($range);
        $rows = Commission::where('employee_id', $employee->id)
            ->where('status', Commission::STATUS_VALIDATED)
            ->whereBetween('created_at', [$from, $to])
            ->get(['amount', 'created_at'])
            ->groupBy(fn (Commission $commission) => $commission->created_at?->toDateString());

        return collect(CarbonPeriod::create($from->toDateString(), $to->toDateString()))
            ->map(fn (Carbon $date) => [
                'date' => $date->toDateString(),
                'amount' => round((float) ($rows->get($date->toDateString())?->sum('amount') ?? 0), 2),
            ])
            ->values()
            ->all();
    }

    private function serviceDistribution(Employee $employee, Carbon $from, Carbon $to): array
    {
        $items = PrestationItem::whereHas('prestation', fn (Builder $query) => $query
            ->where('employee_id', $employee->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED]))
            ->get(['label', 'quantity']);

        $total = max(1, (int) $items->sum('quantity'));

        return $items->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'percent' => round(((int) $group->sum('quantity') / $total) * 100),
            ])
            ->sortByDesc('count')
            ->take(6)
            ->values()
            ->all();
    }

    private function topServices(Employee $employee, Carbon $from, Carbon $to): Collection
    {
        return PrestationItem::whereHas('prestation', fn (Builder $query) => $query
            ->where('employee_id', $employee->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED]))
            ->get()
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum(fn (PrestationItem $item) => $item->lineTotal()), 2),
            ])
            ->sortByDesc('count');
    }

    private function reviewSummary(Employee $employee): array
    {
        $reviews = AppointmentReview::where('employee_id', $employee->id)->with('client')->orderByDesc('reviewed_at')->get();
        $latest = $reviews->first();

        return [
            'average' => $reviews->count() > 0 ? round((float) $reviews->avg('rating'), 1) : null,
            'count' => $reviews->count(),
            'latest' => $latest ? [
                'client_name' => $latest->client?->name ?? 'Client',
                'rating' => $latest->rating,
                'comment' => $latest->comment,
                'reviewed_at' => $latest->reviewed_at?->toIso8601String(),
            ] : null,
        ];
    }

    private function period(string $range, ?string $customFrom = null, ?string $customTo = null): array
    {
        if ($range === 'custom' && $customFrom && $customTo) {
            return [Carbon::parse($customFrom)->startOfDay(), Carbon::parse($customTo)->endOfDay()];
        }

        return match ($range) {
            '7d' => [Carbon::now()->subDays(6)->startOfDay(), Carbon::now()->endOfDay()],
            '3m' => [Carbon::now()->subMonths(2)->startOfMonth(), Carbon::now()->endOfDay()],
            '6m' => [Carbon::now()->subMonths(5)->startOfMonth(), Carbon::now()->endOfDay()],
            'year' => [Carbon::now()->startOfYear(), Carbon::now()->endOfDay()],
            default => [Carbon::now()->startOfMonth(), Carbon::now()->endOfDay()],
        };
    }
}
