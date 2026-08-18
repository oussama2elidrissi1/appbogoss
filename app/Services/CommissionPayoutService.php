<?php

namespace App\Services;

use App\Models\Advance;
use App\Models\CommissionPayout;
use App\Models\Employee;
use App\Models\User;
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
     * @return array{
     *     employee_id: int,
     *     employee_name: string,
     *     avatar_color: string,
     *     commission_total: float,
     *     advances_outstanding: float,
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

        $existing = CommissionPayout::where('employee_id', $employee->id)
            ->where('period', $period)
            ->with('paidBy')
            ->first();

        return [
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'avatar_color' => $employee->avatar_color,
            'commission_total' => $commissionTotal,
            'advances_outstanding' => round($advancesOutstanding, 2),
            'net_amount' => round(max(0, $commissionTotal - $advancesOutstanding), 2),
            'already_paid' => $existing !== null,
            'payout' => $existing === null ? null : [
                'id' => $existing->id,
                'net_amount' => (float) $existing->net_amount,
                'paid_at' => $existing->paid_at->toIso8601String(),
                'paid_by' => $existing->paidBy?->name,
            ],
        ];
    }

    /**
     * Records the payout and settles every advance it covers, in one
     * transaction. Throws if this employee was already paid for this exact
     * period (the unique constraint is the hard backstop; this check gives a
     * clean error message instead of a raw DB exception) or if there's
     * nothing owed (advances already cover or exceed commission earned).
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
        if (CommissionPayout::where('employee_id', $employee->id)->where('period', $period)->exists()) {
            throw ValidationException::withMessages([
                'period' => 'Cet employé a déjà été payé pour cette période.',
            ]);
        }

        [$from, $to] = $this->periodBounds($period);
        $commissionTotal = $this->earnings->commissionEarnedTotal($employee, $from, $to);

        $outstandingAdvances = Advance::where('employee_id', $employee->id)
            ->outstanding()
            ->where('given_on', '<=', $to->toDateString())
            ->get();
        $advancesTotal = (float) $outstandingAdvances->sum('amount');

        if ($commissionTotal < $advancesTotal) {
            throw ValidationException::withMessages([
                'net_amount' => 'Les avances en cours dépassent la commission de cette période — rien à payer pour le moment.',
            ]);
        }

        $netAmount = round($commissionTotal - $advancesTotal, 2);

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
     * @return array{0: Carbon, 1: Carbon}
     */
    private function periodBounds(string $period): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $period.'-01')->startOfMonth();

        return [$start->copy()->startOfDay(), $start->copy()->endOfMonth()->endOfDay()];
    }
}
