<?php

namespace App\Console\Commands;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Services\EmployeeEarningsService;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Reconciles an employee's day, line by line, against the workspace KPIs —
 * for when "the card says X but my lines sum to Y". Read-only. Shows, for
 * every prestation and caisse sale of the day: the ticket total, the CA
 * retained for this employee, their validated commission, and the exact
 * reason anything was excluded (voided caisse ticket, colleague's share on
 * a shared ticket, cancelled commission).
 */
class ReconcileEmployeeDay extends Command
{
    protected $signature = 'employee:reconcile-day
        {employee : Nom (ou ID) de l\'employé}
        {--date= : Jour à examiner (AAAA-MM-JJ, défaut aujourd\'hui)}';

    protected $description = "Explique, ligne par ligne, le CA et la commission du jour d'un employé — et d'où vient chaque écart";

    public function handle(EmployeeEarningsService $earnings): int
    {
        $needle = (string) $this->argument('employee');
        $employee = is_numeric($needle)
            ? Employee::find((int) $needle)
            : Employee::where('name', 'like', '%'.$needle.'%')->first();

        if ($employee === null) {
            $this->error('Employé introuvable : '.$needle);

            return self::FAILURE;
        }

        $day = $this->option('date') ? Carbon::parse($this->option('date')) : Carbon::today();
        $from = $day->copy()->startOfDay();
        $to = $day->copy()->endOfDay();

        $this->info(sprintf('%s — journée du %s', $employee->name, $day->toDateString()));

        $prestations = Prestation::where('employee_id', $employee->id)
            ->whereBetween('created_at', [$from, $to])
            ->with(['items', 'commissions.employee'])
            ->orderBy('created_at')
            ->get();
        $voidedSaleIds = $earnings->deletedSaleIds($prestations->pluck('sale_id')->filter()->values());

        $rows = [];
        $revenueTotal = 0.0;
        $commissionTotal = 0.0;

        foreach ($prestations as $prestation) {
            $flags = [];
            $mine = $prestation->commissions
                ->where('employee_id', $employee->id)
                ->where('status', Commission::STATUS_VALIDATED)
                ->sum('amount');
            $others = $prestation->commissions
                ->where('status', Commission::STATUS_VALIDATED)
                ->where('employee_id', '!=', $employee->id);
            $cancelled = $prestation->commissions->where('status', Commission::STATUS_CANCELLED)->sum('amount');

            $voided = $prestation->sale_id !== null && $voidedSaleIds->has($prestation->sale_id);
            $isPaid = $prestation->status === Prestation::STATUS_PAID;

            $revenue = 0.0;
            $commission = 0.0;

            if ($voided) {
                $flags[] = 'TICKET CAISSE SUPPRIMÉ → exclu du CA et de la commission';
            } elseif (! $isPaid) {
                $flags[] = in_array($prestation->status, [Prestation::STATUS_CANCELLED, Prestation::STATUS_REFUNDED], true)
                    ? 'annulée/remboursée → jamais comptée'
                    : 'statut '.$prestation->status.' → comptée une fois payée';
            } else {
                $othersItemIds = $others->pluck('prestation_item_id')->filter()->unique();
                $othersTotal = (float) $prestation->items->whereIn('id', $othersItemIds)
                    ->sum(fn ($item) => $item->lineTotal());
                $revenue = round(max(0, (float) $prestation->total - $othersTotal), 2);
                $commission = round((float) $mine, 2);

                foreach ($others->groupBy('employee_id') as $rowsOfOther) {
                    $flags[] = sprintf(
                        'part de %s : %s MAD (retirée de votre CA)',
                        $rowsOfOther->first()->employee?->name ?? 'un collègue',
                        number_format((float) $rowsOfOther->sum('amount') * 2, 2),
                    );
                }
                if ($cancelled > 0) {
                    $flags[] = sprintf('commission annulée non comptée : %s MAD', number_format((float) $cancelled, 2));
                }
            }

            $revenueTotal += $revenue;
            $commissionTotal += $commission;

            $rows[] = [
                $prestation->reference,
                $prestation->created_at->format('H:i'),
                number_format((float) $prestation->total, 2),
                number_format($revenue, 2),
                number_format($commission, 2),
                implode(' · ', $flags) ?: '—',
            ];
        }

        $legacy = $earnings->legacySales($employee)
            ->withTrashed()
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('created_at')
            ->get();

        foreach ($legacy as $sale) {
            $isVoided = $sale->trashed();
            $revenue = $isVoided ? 0.0 : (float) $sale->total;
            $commission = $isVoided ? 0.0 : (float) $sale->commission_amount;
            $revenueTotal += $revenue;
            $commissionTotal += $commission;

            $rows[] = [
                'CAISSE-'.$sale->id,
                $sale->created_at->format('H:i'),
                number_format((float) $sale->total, 2),
                number_format($revenue, 2),
                number_format($commission, 2),
                $isVoided ? 'TICKET SUPPRIMÉ → exclu' : '—',
            ];
        }

        $this->table(['Référence', 'Heure', 'Ticket', 'CA retenu', 'Commission', 'Explication'], $rows);

        $kpiCommission = $earnings->commissionEarnedTotal($employee, $from, $to);
        $this->newLine();
        $this->line(sprintf('CA du jour (carte)          : %s MAD', number_format($revenueTotal, 2)));
        $this->line(sprintf('Commission du jour (carte)  : %s MAD', number_format($kpiCommission, 2)));

        if (abs($commissionTotal - $kpiCommission) > 0.01) {
            $this->warn(sprintf(
                'Écart entre la somme des lignes (%s) et le KPI (%s) — signalez-le, cela ne devrait plus arriver.',
                number_format($commissionTotal, 2),
                number_format($kpiCommission, 2),
            ));
        } else {
            $this->info('Lignes et cartes sont parfaitement alignées.');
        }

        return self::SUCCESS;
    }
}
