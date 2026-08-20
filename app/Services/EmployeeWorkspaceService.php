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
use App\Models\SaleItem;
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
            ->with(['items', 'client', 'commissions'])
            ->get();
        $yesterdayPrestations = $this->prestations($employee)
            ->whereDate('created_at', $yesterday)
            ->count();
        $legacySalesToday = $this->legacySales($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay());
        $legacySalesYesterday = $this->legacySales($employee, $yesterday->copy()->startOfDay(), $yesterday->copy()->endOfDay());

        $paidToday = $todayPrestations->where('status', Prestation::STATUS_PAID);
        $appointmentsToday = $this->appointmentRows($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay());
        $appointmentsYesterday = $this->appointmentRows($employee, $yesterday->copy()->startOfDay(), $yesterday->copy()->endOfDay());
        $upcomingAppointments = $appointmentsToday
            ->filter(fn (array $row) => Carbon::parse($row['starts_at'])->gte(now()) && ! in_array($row['status'], ['cancelled', 'refused', 'no_show'], true))
            ->values();

        $commissionsToday = $this->commissionSum($employee, $today->copy()->startOfDay(), $today->copy()->endOfDay());
        $monthPreview = $this->payouts->preview($employee, Carbon::now()->format('Y-m'));

        // Prestations whose caisse ticket was voided ("supprimé"): their
        // commissions are already excluded from the KPI (deletedSaleIds in
        // EmployeeEarningsService) — CA and the per-row column must follow,
        // or the cards contradict the list they sit above.
        $voidedSaleIds = $this->earnings->deletedSaleIds($todayPrestations->pluck('sale_id')->filter()->values());

        $distribution = $this->serviceDistribution($employee, $monthStart, Carbon::now()->endOfDay());
        $reviews = $this->reviewSummary($employee);

        return [
            'employee' => $this->employeeCard($employee),
            'today' => [
                'date' => now()->toIso8601String(),
                'prestations_count' => $todayPrestations->count() + $legacySalesToday->count() + $appointmentsToday->count(),
                'prestations_delta' => ($todayPrestations->count() + $legacySalesToday->count() + $appointmentsToday->count())
                    - ($yesterdayPrestations + $legacySalesYesterday->count() + $appointmentsYesterday->count()),
                'revenue' => round((float) $paidToday
                    ->reject(fn (Prestation $prestation) => $prestation->sale_id !== null && $voidedSaleIds->has($prestation->sale_id))
                    ->sum(fn (Prestation $prestation) => $this->revenueShare($prestation, $employee)) + (float) $legacySalesToday->sum('total'), 2),
                'commission' => round($commissionsToday, 2),
                'monthly_commission' => $monthPreview['commission_total'],
                'paid_commission' => round($monthPreview['paid_net_total'] + $monthPreview['paid_advances_total'], 2),
            ],
            'prestations_today' => $todayPrestations
                ->map(fn (Prestation $prestation) => $this->prestationRow($prestation, $employee, $voidedSaleIds))
                ->concat($legacySalesToday->map(fn (Sale $sale) => $this->legacySalePrestationRow($sale)))
                ->sortBy('date')
                ->values()
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

        $prestations = $query->orderByDesc('created_at')
            ->limit(250)
            ->get();
        $voidedSaleIds = $this->earnings->deletedSaleIds($prestations->pluck('sale_id')->filter()->values());
        $prestationRows = $prestations
            ->map(fn (Prestation $prestation) => $this->prestationRow($prestation, $employee, $voidedSaleIds));
        $legacyRows = $this->legacySalePrestationRows($employee, $filters);

        return $prestationRows
            ->concat($legacyRows)
            ->sortByDesc('date')
            ->take(250)
            ->values()
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

        $commissionRows = $query->limit(300)->get()->map(fn (Commission $commission) => [
            'id' => $commission->id,
            'date' => $commission->created_at?->toIso8601String(),
            'client_name' => $commission->prestation?->client?->name ?? $commission->prestation?->client_label ?? 'Client de passage',
            'service_name' => $commission->service?->name ?? 'Service',
            'service_price' => (float) $commission->base_amount,
            'type' => $commission->type,
            'amount' => (float) $commission->amount,
            'status' => $commission->status,
        ]);
        $legacyCommissionRows = $this->legacySaleCommissionRows($employee, $filters);
        $rows = $commissionRows
            ->concat($legacyCommissionRows)
            ->sortByDesc('date')
            ->take(300)
            ->values()
            ->all();

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
                'paid' => round($monthPreview['paid_net_total'] + $monthPreview['paid_advances_total'], 2),
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
            ->with(['items', 'client', 'commissions'])
            ->get();
        $legacySales = $this->legacySales($employee, $from, $to);
        $paid = $prestations->where('status', Prestation::STATUS_PAID);
        $statsVoidedSaleIds = $this->earnings->deletedSaleIds($prestations->pluck('sale_id')->filter()->values());
        $reviews = AppointmentReview::where('employee_id', $employee->id)->whereBetween('reviewed_at', [$from, $to])->get();
        $activeDays = $prestations
            ->map(fn (Prestation $prestation) => $prestation->created_at)
            ->concat($legacySales->map(fn (Sale $sale) => $sale->created_at))
            ->filter();

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'prestations' => $prestations->count() + $legacySales->count(),
                'revenue' => round((float) $paid
                    ->reject(fn (Prestation $prestation) => $prestation->sale_id !== null && $statsVoidedSaleIds->has($prestation->sale_id))
                    ->sum(fn (Prestation $prestation) => $this->revenueShare($prestation, $employee)) + (float) $legacySales->sum('total'), 2),
                'commission_generated' => round($this->commissionSum($employee, $from, $to), 2),
                'commission_paid' => round((float) CommissionPayout::where('employee_id', $employee->id)->whereBetween('paid_at', [$from, $to])->get()->sum(fn (CommissionPayout $payout) => (float) $payout->net_amount + (float) $payout->advances_deducted), 2),
                'average_rating' => $reviews->count() > 0 ? round((float) $reviews->avg('rating'), 1) : null,
                'clients_served' => $paid->pluck('client_id')->concat($legacySales->pluck('client_id'))->filter()->unique()->count(),
                'average_duration' => round((float) $prestations->flatMap->items->avg('duration_minutes'), 0),
            ],
            'commission_evolution' => $this->commissionEvolution($employee, $filters['range'] ?? 'month', $from, $to),
            'service_distribution' => $this->serviceDistribution($employee, $from, $to),
            'top_services' => $this->topServices($employee, $from, $to)->values()->all(),
            'active_days' => $activeDays
                ->groupBy(fn (Carbon $date) => $date->locale('fr')->isoFormat('dddd'))
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

    /**
     * The slice of a prestation's total that is THIS employee's own work.
     * A multi-service ticket can carry items done by colleagues — identified
     * by their validated commission rows — whose line totals must not inflate
     * this employee's CA the way they inflated the commission column. Items
     * with no commission row (tips, free lines) stay with the ticket owner.
     */
    private function revenueShare(Prestation $prestation, Employee $employee): float
    {
        $othersItemIds = $prestation->commissions
            ->where('status', Commission::STATUS_VALIDATED)
            ->where('employee_id', '!=', $employee->id)
            ->pluck('prestation_item_id')
            ->filter()
            ->unique();

        if ($othersItemIds->isEmpty()) {
            return (float) $prestation->total;
        }

        $othersTotal = (float) $prestation->items
            ->whereIn('id', $othersItemIds)
            ->sum(fn (PrestationItem $item) => $item->lineTotal());

        return round(max(0.0, (float) $prestation->total - $othersTotal), 2);
    }

    private function prestationRow(Prestation $prestation, Employee $employee, ?Collection $voidedSaleIds = null): array
    {
        $prestation->loadMissing(['items', 'client', 'commissions']);

        $saleVoided = $voidedSaleIds !== null
            && $prestation->sale_id !== null
            && $voidedSaleIds->has($prestation->sale_id);

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
            // THIS employee's validated commission only — a multi-service
            // prestation can carry colleagues' commission rows too, and
            // summing them all made the history column disagree with the
            // day/month KPIs (which have always filtered by employee+status).
            // A prestation whose caisse ticket was voided earns nothing, same
            // rule the KPI has always applied (deletedSaleIds).
            'commission' => $saleVoided ? 0.0 : round((float) $prestation->commissions
                ->where('employee_id', $employee->id)
                ->where('status', Commission::STATUS_VALIDATED)
                ->sum('amount'), 2),
            'status' => $prestation->status,
            'sale_deleted' => $saleVoided,
        ];
    }

    private function legacySales(Employee $employee, Carbon $from, Carbon $to): Collection
    {
        return $this->earnings->legacySales($employee)
            ->with(['items', 'client', 'service'])
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->get()
            ->reject(fn (Sale $sale) => $sale->trashed())
            ->values();
    }

    private function legacySalePrestationRows(Employee $employee, array $filters): Collection
    {
        if (! empty($filters['status']) && $filters['status'] !== Prestation::STATUS_PAID) {
            return collect();
        }

        $query = $this->earnings->legacySales($employee)->with(['items', 'client', 'service']);

        if (! empty($filters['from'])) {
            $query->whereDate('created_at', '>=', $filters['from']);
        }
        if (! empty($filters['to'])) {
            $query->whereDate('created_at', '<=', $filters['to']);
        }
        if (! empty($filters['service_id'])) {
            $serviceId = (int) $filters['service_id'];
            $query->where(function (Builder $builder) use ($serviceId) {
                $builder->where('service_id', $serviceId)
                    ->orWhereHas('items', fn (Builder $item) => $item->where('itemable_id', $serviceId));
            });
        }
        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('client_label', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhereHas('client', fn (Builder $client) => $client->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('items', fn (Builder $item) => $item->where('label', 'like', "%{$search}%"));
            });
        }

        return $query->orderByDesc('created_at')
            ->limit(250)
            ->get()
            ->reject(fn (Sale $sale) => $sale->trashed())
            ->map(fn (Sale $sale) => $this->legacySalePrestationRow($sale))
            ->values();
    }

    private function legacySalePrestationRow(Sale $sale): array
    {
        $sale->loadMissing(['items', 'client', 'service']);

        return [
            'id' => -1 * $sale->id,
            'reference' => 'CAISSE-'.$sale->id,
            'date' => $sale->created_at?->toIso8601String(),
            'time' => $sale->created_at?->format('H:i'),
            'client_id' => $sale->client_id,
            'client_name' => $sale->client?->name ?? $sale->client_label ?? 'Client de passage',
            'client_phone' => $sale->client?->phone,
            'service' => $this->legacySaleServiceLabel($sale),
            'duration_minutes' => 0,
            'amount' => (float) $sale->total,
            'commission' => round((float) $sale->commission_amount, 2),
            'status' => Prestation::STATUS_PAID,
        ];
    }

    private function legacySaleCommissionRows(Employee $employee, array $filters): Collection
    {
        if (! empty($filters['status']) && $filters['status'] !== Commission::STATUS_VALIDATED) {
            return collect();
        }

        $query = $this->earnings->legacySales($employee)->with(['items', 'client', 'service']);

        if (! empty($filters['from'])) {
            $query->whereDate('created_at', '>=', $filters['from']);
        }
        if (! empty($filters['to'])) {
            $query->whereDate('created_at', '<=', $filters['to']);
        }

        return $query->orderByDesc('created_at')
            ->limit(300)
            ->get()
            ->reject(fn (Sale $sale) => $sale->trashed())
            ->filter(fn (Sale $sale) => (float) $sale->commission_amount !== 0.0)
            ->map(fn (Sale $sale) => [
                'id' => -1 * $sale->id,
                'date' => $sale->created_at?->toIso8601String(),
                'client_name' => $sale->client?->name ?? $sale->client_label ?? 'Client de passage',
                'service_name' => $this->legacySaleServiceLabel($sale),
                'service_price' => (float) $sale->total,
                'type' => 'caisse',
                'amount' => (float) $sale->commission_amount,
                'status' => Commission::STATUS_VALIDATED,
            ])
            ->values();
    }

    private function legacySaleServiceLabel(Sale $sale): string
    {
        $labels = $sale->items->pluck('label')->filter()->values();

        if ($labels->isNotEmpty()) {
            return $labels->join(' + ');
        }

        return $sale->service?->name ?? $sale->category ?? 'Encaissement caisse';
    }

    private function legacySaleServiceRows(Collection $sales): Collection
    {
        return $sales->flatMap(function (Sale $sale) {
            $sale->loadMissing(['items', 'service']);

            if ($sale->items->isEmpty()) {
                return [[
                    'label' => $this->legacySaleServiceLabel($sale),
                    'quantity' => 1,
                    'total' => (float) $sale->total,
                ]];
            }

            return $sale->items->map(fn (SaleItem $item) => [
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
                'total' => round((float) $item->quantity * (float) $item->unit_price, 2),
            ]);
        })->values();
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
        $commissionRows = $this->earnings->activeValidatedCommissions($employee->id, $from, $to)
            ->map(fn (Commission $commission) => [
                'date' => $commission->created_at?->toDateString(),
                'amount' => (float) $commission->amount,
            ]);
        $legacyRows = $this->legacySales($employee, $from, $to)
            ->map(fn (Sale $sale) => [
                'date' => $sale->created_at?->toDateString(),
                'amount' => (float) $sale->commission_amount,
            ]);
        $rows = $commissionRows->concat($legacyRows)->groupBy('date');

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
            ->get(['label', 'quantity'])
            ->map(fn (PrestationItem $item) => [
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
            ])
            ->concat($this->legacySaleServiceRows($this->legacySales($employee, $from, $to)));

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
        $items = PrestationItem::whereHas('prestation', fn (Builder $query) => $query
            ->where('employee_id', $employee->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED]))
            ->get()
            ->map(fn (PrestationItem $item) => [
                'label' => $item->label,
                'quantity' => (int) $item->quantity,
                'total' => (float) $item->lineTotal(),
            ])
            ->concat($this->legacySaleServiceRows($this->legacySales($employee, $from, $to)));

        return $items
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum('total'), 2),
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
