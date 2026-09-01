<?php

namespace App\Services;

use App\Models\Advance;
use App\Models\CommissionPayout;
use App\Models\Employee;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Models\WorkDay;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Monthly commission payroll — what BOGOSLAND owes each employee this month,
 * net of salary advances already handed to them. An advance is money given
 * ahead of time against that month's commission, not an unrelated loan — so
 * settling the payout also settles whatever advances it covers.
 *
 * Outstanding advances are deducted regardless of exactly which month they
 * were given (an unsettled advance from a prior month still reduces this
 * month's payout) — nothing is ever silently dropped, it just rolls forward
 * to whichever month finally has enough commission to cover it.
 */
class CommissionPayoutService
{
    public function __construct(
        private readonly EmployeeEarningsService $earnings,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    /**
     * A period can hold several payouts (an employee can leave mid-month, be
     * paid, then come back and earn more): net_amount is therefore what is
     * STILL owed — commission earned minus everything already covered by
     * previous payouts (their net + the advances they settled) minus the
     * advances currently outstanding.
     *
     * @return array{
     *     employee_id: int,
     *     employee_name: string,
     *     avatar_color: string,
     *     commission_total: float,
     *     advances_outstanding: float,
     *     paid_net_total: float,
     *     paid_advances_total: float,
     *     net_amount: float,
     *     already_paid: bool,
     *     payout: array{id: int, net_amount: float, paid_at: string, paid_by: string|null}|null,
     * }
     */
    public function preview(Employee $employee, string $period): array
    {
        [$from, $to] = $this->periodBounds($period);

        $commissionTotal = $this->earnings->commissionEarnedTotal($employee, $from, $to);
        $advancesOutstanding = (float) Advance::where('employee_id', $employee->id)
            ->outstanding()
            ->where('given_on', '<=', $to->toDateString())
            ->sum('amount');

        $payouts = CommissionPayout::where('employee_id', $employee->id)
            ->where('period', $period)
            ->with('paidBy')
            ->orderBy('paid_at')
            ->get();
        $paidNetTotal = (float) $payouts->sum('net_amount');
        $paidAdvancesTotal = (float) $payouts->sum('advances_deducted');
        $paidFromWallet = $this->walletCreditedTotal($employee, $period);
        $latest = $payouts->last();

        return [
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'avatar_color' => $employee->avatar_color,
            'commission_total' => $commissionTotal,
            'advances_outstanding' => round($advancesOutstanding, 2),
            'paid_net_total' => round($paidNetTotal, 2),
            'paid_advances_total' => round($paidAdvancesTotal, 2),
            // Argent deja remis a l'employe depuis un portefeuille pour ce
            // mois. Expose a part pour que l'ecran puisse l'expliquer plutot
            // que de laisser le net baisser sans raison visible.
            'paid_from_wallet' => $paidFromWallet,
            'net_amount' => round(max(0, $commissionTotal - $paidNetTotal - $paidAdvancesTotal - $paidFromWallet - $advancesOutstanding), 2),
            'already_paid' => $latest !== null,
            'payout' => $latest === null ? null : [
                'id' => $latest->id,
                'net_amount' => (float) $latest->net_amount,
                'paid_at' => $latest->paid_at->toIso8601String(),
                'paid_by' => $latest->paidBy?->name,
            ],
        ];
    }

    /**
     * Records the payout and settles every advance it covers, in one
     * transaction. A period can already hold payouts (employee paid, then
     * came back and earned more): this pays only the commission not yet
     * covered by them. Throws when nothing new is owed, or when outstanding
     * advances exceed the remaining commission (that surplus rolls into the
     * next month instead).
     *
     * With $deductFromCaisse, the net amount handed over is also recorded as
     * a cash-out on the open register day — stored as an advance that is born
     * settled and linked to this payout, so it reduces the day's expected
     * cash without ever counting as money still owed by the employee. This
     * replaces the manual workaround of creating an advance and clicking
     * "Solder" after marking the month paid.
     */
    public function pay(Employee $employee, string $period, User $actor, ?string $notes = null, bool $deductFromCaisse = false): CommissionPayout
    {
        [$from, $to] = $this->periodBounds($period);
        $commissionTotal = $this->earnings->commissionEarnedTotal($employee, $from, $to);

        $alreadyCovered = (float) CommissionPayout::where('employee_id', $employee->id)
            ->where('period', $period)
            ->get()
            ->sum(fn (CommissionPayout $payout) => (float) $payout->net_amount + (float) $payout->advances_deducted);
        // Ce qui est deja sorti d'un portefeuille pour ce mois couvre la
        // commission au meme titre qu'une paie enregistree : sans cette ligne,
        // « Marquer comme paye » reverserait une seconde fois un montant deja
        // remis en main propre.
        $alreadyCovered += $this->walletCreditedTotal($employee, $period);
        $commissionRemaining = round($commissionTotal - $alreadyCovered, 2);

        if ($commissionRemaining <= 0) {
            throw ValidationException::withMessages([
                'period' => 'La commission de cette période a déjà été entièrement payée.',
            ]);
        }

        $outstandingAdvances = Advance::where('employee_id', $employee->id)
            ->outstanding()
            ->where('given_on', '<=', $to->toDateString())
            ->get();
        $advancesTotal = (float) $outstandingAdvances->sum('amount');

        if ($commissionRemaining < $advancesTotal) {
            throw ValidationException::withMessages([
                'net_amount' => 'Les avances en cours dépassent la commission restante de cette période — rien à payer pour le moment.',
            ]);
        }

        $netAmount = round($commissionRemaining - $advancesTotal, 2);
        // The record stores only the commission slice THIS payout covers, so
        // summing net + advances_deducted across a period's payouts always
        // equals the commission already paid for.
        $commissionTotal = $commissionRemaining;

        $openDay = null;
        if ($deductFromCaisse && $netAmount > 0) {
            $openDay = WorkDay::where('status', 'open')->first();

            if ($openDay === null) {
                throw ValidationException::withMessages([
                    'deduct_from_caisse' => 'Aucune journée de caisse ouverte — ouvrez la caisse ou décochez la sortie de caisse.',
                ]);
            }
        }

        return DB::transaction(function () use ($employee, $period, $actor, $notes, $commissionTotal, $advancesTotal, $netAmount, $outstandingAdvances, $openDay) {
            $payout = CommissionPayout::create([
                'employee_id' => $employee->id,
                'period' => $period,
                'commission_total' => $commissionTotal,
                'advances_deducted' => $advancesTotal,
                'net_amount' => $netAmount,
                'paid_by_user_id' => $actor->id,
                'paid_at' => now(),
                'notes' => $notes,
            ]);

            if ($outstandingAdvances->isNotEmpty()) {
                Advance::whereIn('id', $outstandingAdvances->pluck('id'))->update([
                    'settled_at' => now(),
                    'commission_payout_id' => $payout->id,
                ]);
            }

            if ($openDay !== null) {
                Advance::create([
                    'employee_id' => $employee->id,
                    'work_day_id' => $openDay->id,
                    'amount' => $netAmount,
                    'reason' => 'Paiement commission '.$payout->period,
                    'given_on' => now()->toDateString(),
                    'settled_at' => now(),
                    'commission_payout_id' => $payout->id,
                ]);
            }

            $this->activityLogger->log('commission_payout.paid', $payout, [], [
                'employee_id' => $employee->id,
                'period' => $period,
                'commission_total' => $commissionTotal,
                'advances_deducted' => $advancesTotal,
                'net_amount' => $netAmount,
            ]);

            return $payout->load(['employee', 'paidBy']);
        });
    }

    /**
     * Ce qui a deja ete remis a l'employe depuis un portefeuille pour ce mois,
     * et qui couvre sa commission.
     *
     * Seuls « Commission » et « Salaire » comptent, et le choix est
     * deliberement conservateur :
     *
     *  - une AVANCE est deja portee par la table `advances`, que la paie
     *    deduit de son cote ; la compter ici la retirerait deux fois ;
     *  - une PRIME s'ajoute a la commission, elle ne la solde pas ;
     *  - « Autre » ne dit rien de sa nature, donc ne reduit rien.
     *
     * Renvoie 0 tant qu'aucun versement de portefeuille n'existe — ce qui
     * etait le cas de toute l'application avant le module Wallet, et rend
     * cette methode sans effet sur l'historique.
     */
    private function walletCreditedTotal(Employee $employee, string $period): float
    {
        return round((float) WalletTransaction::query()
            ->where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)
            ->where('employee_id', $employee->id)
            ->where('period', $period)
            ->whereIn('category', [
                WalletService::PAYMENT_COMMISSION,
                WalletService::PAYMENT_SALARY,
            ])
            ->sum('amount'), 2);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function periodBounds(string $period): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $period.'-01')->startOfMonth();

        return [$start->copy()->startOfDay(), $start->copy()->endOfMonth()->endOfDay()];
    }
}
