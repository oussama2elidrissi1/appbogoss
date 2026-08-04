<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use App\Services\EmployeeEarningsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;

/**
 * The employee's personal space — everything here is scoped to the
 * authenticated user's own Employee record, server-side, regardless of what
 * a client might pass in. An account with no linked employee gets 403.
 */
class MeController extends Controller
{
    public function __construct(private readonly EmployeeEarningsService $earnings)
    {
    }

    public function dashboard(Request $request): JsonResponse
    {
        $employee = $this->employeeOrFail($request);
        $today = Carbon::today();
        $weekStart = Carbon::now()->startOfWeek();
        $monthStart = Carbon::now()->startOfMonth();

        $todaysPrestations = Prestation::where('employee_id', $employee->id)
            ->whereDate('created_at', $today)
            ->get();

        // Fetched once from the earliest bound needed (week start can fall
        // before month start, e.g. a week that spans two months) and sliced
        // in memory per bucket below — avoids three near-identical queries.
        $legacyRangeStart = $weekStart->lt($monthStart) ? $weekStart : $monthStart;
        $legacySalesInRange = $this->earnings->legacySales($employee)->where('created_at', '>=', $legacyRangeStart)->get();
        $activeLegacySalesInRange = $legacySalesInRange->reject(fn (Sale $sale) => $sale->trashed());
        $activeLegacySalesToday = $activeLegacySalesInRange->filter(fn (Sale $sale) => $sale->created_at->isSameDay($today));
        $activeLegacySalesWeek = $activeLegacySalesInRange->filter(fn (Sale $sale) => $sale->created_at->gte($weekStart));
        $activeLegacySalesMonth = $activeLegacySalesInRange->filter(fn (Sale $sale) => $sale->created_at->gte($monthStart));

        $paidToday = $todaysPrestations->where('status', Prestation::STATUS_PAID);
        $deletedPaidTodaySaleIds = $this->earnings->deletedSaleIds($paidToday->pluck('sale_id')->filter()->values());
        $activePaidToday = $paidToday->reject(
            fn (Prestation $prestation) => $prestation->sale_id !== null
                && $deletedPaidTodaySaleIds->has($prestation->sale_id),
        );

        $inProgress = Prestation::where('employee_id', $employee->id)
            ->whereIn('status', [Prestation::STATUS_DRAFT, Prestation::STATUS_IN_PROGRESS, Prestation::STATUS_SERVICES_DONE])
            ->count();
        $pendingPayment = Prestation::where('employee_id', $employee->id)
            ->where('status', Prestation::STATUS_PENDING_PAYMENT)
            ->count();

        // Commission cards must match "Mon rapport", which already blends
        // Prestation-workflow commissions with legacy caisse commissions —
        // showing only the former here made the dashboard silently disagree
        // with the report right below it.
        $commissionWeek = $this->earnings->activeValidatedCommissions($employee->id, from: $weekStart)->sum('amount')
            + (float) $activeLegacySalesWeek->sum('commission_amount');
        $commissionMonth = $this->earnings->activeValidatedCommissions($employee->id, from: $monthStart)->sum('amount')
            + (float) $activeLegacySalesMonth->sum('commission_amount');
        $commissionToday = $this->earnings->activeValidatedCommissions($employee->id, onDate: $today)->sum('amount')
            + (float) $activeLegacySalesToday->sum('commission_amount');

        $recent = Prestation::where('employee_id', $employee->id)
            ->with('items')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();
        $recentLegacySales = $this->earnings->legacySales($employee)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();
        $recentDeletedPrestationSaleIds = $this->earnings->deletedSaleIds(
            $recent->where('status', Prestation::STATUS_PAID)->pluck('sale_id')->filter()->values(),
        );

        $recentMerged = $recent
            ->map(fn (Prestation $prestation) => [
                'id' => 'prestation-'.$prestation->id,
                'reference' => $prestation->reference,
                'status' => $prestation->status,
                'total' => (float) $prestation->total,
                'created_at' => $prestation->created_at?->toIso8601String(),
                'is_deleted' => $prestation->sale_id !== null
                    && $recentDeletedPrestationSaleIds->has($prestation->sale_id),
            ])
            ->concat($recentLegacySales->map(fn (Sale $sale) => [
                'id' => 'vente-'.$sale->id,
                'reference' => 'Vente #'.$sale->id,
                'status' => 'paid',
                'total' => (float) $sale->total,
                'created_at' => $sale->created_at?->toIso8601String(),
                'is_deleted' => $sale->trashed(),
            ]))
            ->sortByDesc('created_at')
            ->take(10)
            ->values();

        return response()->json(['data' => [
            'prestations_today_count' => $todaysPrestations->count() + $activeLegacySalesToday->count(),
            'revenue_today' => round((float) $activePaidToday->sum('total') + (float) $activeLegacySalesToday->sum('total'), 2),
            'commission_today' => round((float) $commissionToday, 2),
            'in_progress_count' => $inProgress,
            'pending_payment_count' => $pendingPayment,
            'paid_today_count' => $activePaidToday->count() + $activeLegacySalesToday->count(),
            'commission_week' => round((float) $commissionWeek, 2),
            'commission_month' => round((float) $commissionMonth, 2),
            'recent' => $recentMerged,
        ]]);
    }

    public function commissions(Request $request): JsonResponse
    {
        $employee = $this->employeeOrFail($request);
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'service_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string'],
        ]);

        $query = Commission::where('employee_id', $employee->id)
            ->with(['prestation', 'service'])
            ->orderByDesc('created_at');

        if (! empty($validated['from'])) {
            $query->whereDate('created_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('created_at', '<=', $validated['to']);
        }
        if (! empty($validated['service_id'])) {
            $query->where('service_id', $validated['service_id']);
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $commissions = $query->get();
        $deletedSaleIds = $this->earnings->deletedSaleIds(
            $commissions->pluck('prestation.sale_id')->filter()->values(),
        );

        $rows = $commissions->map(fn (Commission $commission) => [
            'id' => $commission->id,
            'date' => $commission->created_at?->toIso8601String(),
            'prestation_reference' => $commission->prestation?->reference,
            'service_name' => $commission->service?->name,
            'base_amount' => (float) $commission->base_amount,
            'type' => $commission->type,
            'rate_or_amount' => (float) $commission->rate_or_amount,
            'amount' => (float) $commission->amount,
            'status' => $commission->status,
            // The prestation itself can stay "paid" while its encaissement
            // was voided directly at the caisse (outside the formal refund
            // flow) — this flags that case without touching the audit trail.
            'is_deleted' => $commission->prestation?->sale_id !== null
                && $deletedSaleIds->has($commission->prestation->sale_id),
        ]);

        return response()->json(['data' => $rows]);
    }

    public function report(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->buildReport($request)]);
    }

    public function reportExport(Request $request): Response
    {
        $report = $this->buildReport($request);

        $lines = ["Date,Reference,Client,Total,Statut,Commission"];
        foreach ($report['details'] as $row) {
            $lines[] = implode(',', [
                $row['date'],
                $row['reference'],
                str_replace(',', ' ', (string) $row['client']),
                $row['total'],
                $row['is_deleted'] ? 'supprime' : $row['status'],
                $row['commission'],
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="mon-rapport.csv"',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildReport(Request $request): array
    {
        $employee = $this->employeeOrFail($request);
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $from = ! empty($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : Carbon::now()->startOfMonth();
        $to = ! empty($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : Carbon::now()->endOfDay();

        $prestations = Prestation::where('employee_id', $employee->id)
            ->whereBetween('created_at', [$from, $to])
            ->with(['items', 'client'])
            ->get();

        // Sales recorded directly at the caisse before this employee had a login
        // account (or by an admin picking them from the employee list) never
        // went through the Prestation workflow, but they carry the same
        // employee_id — so they belong in this employee's own history too.
        $legacySales = $this->earnings->legacySales($employee)
            ->whereBetween('created_at', [$from, $to])
            ->with(['items', 'client'])
            ->get();

        $paid = $prestations->where('status', Prestation::STATUS_PAID);
        $cancelled = $prestations->whereIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED]);

        // A prestation stays "paid" in its own workflow even if an admin later
        // voids its linked sale straight from the caisse (outside the formal
        // refund flow) — that void must still take the money out of this
        // employee's stats and be flagged in the detail list.
        $deletedPaidSaleIds = $this->earnings->deletedSaleIds($paid->pluck('sale_id')->filter()->values());
        $activePaid = $paid->reject(
            fn (Prestation $prestation) => $prestation->sale_id !== null
                && $deletedPaidSaleIds->has($prestation->sale_id),
        );
        $activeLegacySales = $legacySales->reject(fn (Sale $sale) => $sale->trashed());

        $commissions = $this->earnings->activeValidatedCommissions($employee->id, from: $from, to: $to);

        $revenue = (float) $activePaid->sum('total') + (float) $activeLegacySales->sum('total');
        $paidCount = $activePaid->count() + $activeLegacySales->count();
        $clientsCount = $activePaid->pluck('client_id')->filter()
            ->concat($activeLegacySales->pluck('client_id')->filter())
            ->unique()->count()
            + $activePaid->whereNull('client_id')->count()
            + $activeLegacySales->whereNull('client_id')->count();
        $averageTicket = $paidCount > 0 ? round($revenue / $paidCount, 2) : 0.0;
        $legacyCommissionTotal = (float) $activeLegacySales->sum('commission_amount');

        $topServices = $prestations
            ->flatMap(fn (Prestation $prestation) => $prestation->items)
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum(fn ($item) => $item->lineTotal()), 2),
            ]);
        $legacyTopServices = $activeLegacySales
            ->flatMap(fn (Sale $sale) => $sale->items)
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum(fn ($item) => $item->quantity * $item->unit_price), 2),
            ]);
        $topServices = $topServices
            ->concat($legacyTopServices)
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('count'),
                'total' => round((float) $group->sum('total'), 2),
            ])
            ->sortByDesc('total')
            ->values()
            ->take(10);

        $prestationDetails = $prestations->map(fn (Prestation $prestation) => [
            'date' => $prestation->created_at?->toDateString(),
            'reference' => $prestation->reference,
            'client' => $prestation->client?->name ?? $prestation->client_label ?? 'Client de passage',
            'total' => (float) $prestation->total,
            'status' => $prestation->status,
            'commission' => round((float) $prestation->items->sum('commission_amount'), 2),
            'is_deleted' => $prestation->sale_id !== null && $deletedPaidSaleIds->has($prestation->sale_id),
            'created_at' => $prestation->created_at,
        ]);
        $legacyDetails = $legacySales->map(fn (Sale $sale) => [
            'date' => $sale->created_at?->toDateString(),
            'reference' => 'Vente #'.$sale->id,
            'client' => $sale->client?->name ?? $sale->client_label ?? 'Client de passage',
            'total' => (float) $sale->total,
            'status' => 'paid',
            'commission' => round((float) $sale->commission_amount, 2),
            'is_deleted' => $sale->trashed(),
            'created_at' => $sale->created_at,
        ]);

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'revenue_total' => round($revenue, 2),
            'commission_total' => round((float) $commissions->sum('amount') + $legacyCommissionTotal, 2),
            'prestations_count' => $prestations->count() + $activeLegacySales->count(),
            'paid_count' => $paidCount,
            'cancelled_count' => $cancelled->count(),
            'clients_count' => $clientsCount,
            'average_ticket' => $averageTicket,
            'top_services' => $topServices,
            'details' => $prestationDetails->concat($legacyDetails)
                ->sortByDesc('created_at')
                ->values()
                ->map(fn (array $row) => collect($row)->except('created_at')->all()),
        ];
    }

    private function employeeOrFail(Request $request): Employee
    {
        $employee = $request->user()->employee;

        abort_if($employee === null, 403, 'Votre compte n’est lié à aucune fiche employé.');

        return $employee;
    }
}
