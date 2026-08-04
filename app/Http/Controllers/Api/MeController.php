<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Sale;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
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
    public function dashboard(Request $request): JsonResponse
    {
        $employee = $this->employeeOrFail($request);
        $today = Carbon::today();
        $weekStart = Carbon::now()->startOfWeek();
        $monthStart = Carbon::now()->startOfMonth();

        $todaysPrestations = Prestation::where('employee_id', $employee->id)
            ->whereDate('created_at', $today)
            ->get();
        $legacySalesToday = $this->legacySales($employee)->whereDate('created_at', $today)->get();

        $paidToday = $todaysPrestations->where('status', Prestation::STATUS_PAID);
        $inProgress = Prestation::where('employee_id', $employee->id)
            ->whereIn('status', [Prestation::STATUS_DRAFT, Prestation::STATUS_IN_PROGRESS, Prestation::STATUS_SERVICES_DONE])
            ->count();
        $pendingPayment = Prestation::where('employee_id', $employee->id)
            ->where('status', Prestation::STATUS_PENDING_PAYMENT)
            ->count();

        $commissionWeek = Commission::where('employee_id', $employee->id)
            ->where('status', Commission::STATUS_VALIDATED)
            ->where('created_at', '>=', $weekStart)
            ->sum('amount');
        $commissionMonth = Commission::where('employee_id', $employee->id)
            ->where('status', Commission::STATUS_VALIDATED)
            ->where('created_at', '>=', $monthStart)
            ->sum('amount');
        $commissionToday = Commission::where('employee_id', $employee->id)
            ->where('status', Commission::STATUS_VALIDATED)
            ->whereDate('created_at', $today)
            ->sum('amount');

        $recent = Prestation::where('employee_id', $employee->id)
            ->with('items')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();
        $recentLegacySales = $this->legacySales($employee)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        $recentMerged = $recent
            ->map(fn (Prestation $prestation) => [
                'id' => 'prestation-'.$prestation->id,
                'reference' => $prestation->reference,
                'status' => $prestation->status,
                'total' => (float) $prestation->total,
                'created_at' => $prestation->created_at?->toIso8601String(),
            ])
            ->concat($recentLegacySales->map(fn (Sale $sale) => [
                'id' => 'vente-'.$sale->id,
                'reference' => 'Vente #'.$sale->id,
                'status' => 'paid',
                'total' => (float) $sale->total,
                'created_at' => $sale->created_at?->toIso8601String(),
            ]))
            ->sortByDesc('created_at')
            ->take(10)
            ->values();

        return response()->json(['data' => [
            'prestations_today_count' => $todaysPrestations->count() + $legacySalesToday->count(),
            'revenue_today' => round((float) $paidToday->sum('total') + (float) $legacySalesToday->sum('total'), 2),
            'commission_today' => round((float) $commissionToday, 2),
            'in_progress_count' => $inProgress,
            'pending_payment_count' => $pendingPayment,
            'paid_today_count' => $paidToday->count() + $legacySalesToday->count(),
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

        $rows = $query->get()->map(fn (Commission $commission) => [
            'id' => $commission->id,
            'date' => $commission->created_at?->toIso8601String(),
            'prestation_reference' => $commission->prestation?->reference,
            'service_name' => $commission->service?->name,
            'base_amount' => (float) $commission->base_amount,
            'type' => $commission->type,
            'rate_or_amount' => (float) $commission->rate_or_amount,
            'amount' => (float) $commission->amount,
            'status' => $commission->status,
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
                $row['status'],
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
        $legacySales = $this->legacySales($employee)
            ->whereBetween('created_at', [$from, $to])
            ->with(['items', 'client'])
            ->get();

        $paid = $prestations->where('status', Prestation::STATUS_PAID);
        $cancelled = $prestations->whereIn('status', [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED]);

        $commissions = Commission::where('employee_id', $employee->id)
            ->where('status', Commission::STATUS_VALIDATED)
            ->whereBetween('created_at', [$from, $to])
            ->get();

        $revenue = (float) $paid->sum('total') + (float) $legacySales->sum('total');
        $paidCount = $paid->count() + $legacySales->count();
        $clientsCount = $paid->pluck('client_id')->filter()
            ->concat($legacySales->pluck('client_id')->filter())
            ->unique()->count()
            + $paid->whereNull('client_id')->count()
            + $legacySales->whereNull('client_id')->count();
        $averageTicket = $paidCount > 0 ? round($revenue / $paidCount, 2) : 0.0;
        $legacyCommissionTotal = (float) $legacySales->sum('commission_amount');

        $topServices = $prestations
            ->flatMap(fn (Prestation $prestation) => $prestation->items)
            ->groupBy('label')
            ->map(fn (Collection $group, string $label) => [
                'label' => $label,
                'count' => (int) $group->sum('quantity'),
                'total' => round((float) $group->sum(fn ($item) => $item->lineTotal()), 2),
            ]);
        $legacyTopServices = $legacySales
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
            'created_at' => $prestation->created_at,
        ]);
        $legacyDetails = $legacySales->map(fn (Sale $sale) => [
            'date' => $sale->created_at?->toDateString(),
            'reference' => 'Vente #'.$sale->id,
            'client' => $sale->client?->name ?? $sale->client_label ?? 'Client de passage',
            'total' => (float) $sale->total,
            'status' => 'paid',
            'commission' => round((float) $sale->commission_amount, 2),
            'created_at' => $sale->created_at,
        ]);

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'revenue_total' => round($revenue, 2),
            'commission_total' => round((float) $commissions->sum('amount') + $legacyCommissionTotal, 2),
            'prestations_count' => $prestations->count() + $legacySales->count(),
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

    /**
     * Sales tied to this employee that were recorded straight from the caisse
     * (legacy quick-checkout, or an admin picking them from the employee list)
     * rather than through the Prestation workflow. Excludes sales the
     * Prestation workflow already created at payment confirmation, so a paid
     * prestation is never counted twice.
     */
    private function legacySales(Employee $employee): Builder
    {
        $linkedSaleIds = Prestation::where('employee_id', $employee->id)
            ->whereNotNull('sale_id')
            ->pluck('sale_id');

        return Sale::where('employee_id', $employee->id)
            ->whereNotIn('id', $linkedSaleIds);
    }
}
