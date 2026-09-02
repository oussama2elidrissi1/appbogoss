<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\MonthlyClosure;
use App\Models\PartnerCommission;
use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Monthly closure — the single place that knows whether a month is open,
 * finished, or locked.
 *
 * Two things this service deliberately does NOT do:
 *
 *  1. It never "opens" a month. The current month is `now()->format('Y-m')`,
 *     as it already was everywhere, so September starts on its own at midnight
 *     with zeroed counters — nothing is reset, copied, or carried over,
 *     because the zero comes from filtering, not from a write. Closing August
 *     never gates September.
 *
 *  2. It never recomputes payroll. Every employee figure comes from
 *     CommissionPayoutService::preview(), which is the same call the Paie
 *     screen makes. The closing checklist can therefore not disagree with the
 *     payroll it is supposed to be checking.
 *
 * TEMPORAL ANCHOR — read this before touching any total here.
 * The project has two anchors, and this service deliberately keeps both rather
 * than inventing a third:
 *
 *  - employee commissions / payroll / this checklist follow
 *    `commissions.created_at` and `sales.created_at` (EmployeeEarningsService);
 *  - the cash reports follow `work_days.date` (WorkDayService).
 *
 * They differ across midnight: a prestation cashed at 00:30 on 1 September on
 * the 31 August cash day yields a commission counted in SEPTEMBER payroll but
 * appears in AUGUST's cash report. That divergence predates this feature and
 * is knowingly preserved — aligning them would retroactively change payroll
 * that has already been paid out. The cash-day check below is the one place
 * both anchors meet, and it uses `work_days.date` because it is asking about
 * cash days, not about commissions.
 */
class MonthlyClosureService
{
    /** Months before this one keep their historical behaviour: never listed, never closed. */
    public const START_PERIOD_KEY = 'closures.start_period';

    /** Hard ceiling on how many open months are listed, so a forgotten install cannot build an unbounded response. */
    private const MAX_LISTED_PERIODS = 60;

    public function __construct(
        private readonly CommissionPayoutService $payouts,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    public function currentPeriod(): string
    {
        return CarbonImmutable::now()->format('Y-m');
    }

    /**
     * The month the closure feature was switched on. Null when the setting is
     * missing (feature not yet activated): nothing is then listed as pending,
     * which is the safe reading — better a feature that shows nothing than one
     * that flags eight historical months as anomalies.
     */
    public function startPeriod(): ?string
    {
        $value = AppSetting::query()->where('key', self::START_PERIOD_KEY)->value('value');

        return is_string($value) && preg_match('/^\d{4}-\d{2}$/', $value) === 1 ? $value : null;
    }

    public function closureFor(string $period): ?MonthlyClosure
    {
        return MonthlyClosure::with('closedBy')->where('period', $period)->first();
    }

    public function isClosed(string $period): bool
    {
        return MonthlyClosure::where('period', $period)->exists();
    }

    /**
     * Finished months still awaiting closure, most recent first.
     *
     * Several may pile up — nothing forces an admin to finalise August before
     * October arrives — and the UI is expected to flag that as an anomaly
     * rather than assume a single one.
     *
     * @return list<string>
     */
    public function periodsToFinalize(): array
    {
        $start = $this->startPeriod();
        if ($start === null) {
            return [];
        }

        $cursor = CarbonImmutable::createFromFormat('!Y-m', $start)->startOfMonth();
        $current = CarbonImmutable::createFromFormat('!Y-m', $this->currentPeriod())->startOfMonth();

        $candidates = [];
        while ($cursor->lessThan($current) && count($candidates) < self::MAX_LISTED_PERIODS) {
            $candidates[] = $cursor->format('Y-m');
            $cursor = $cursor->addMonth();
        }

        if ($candidates === []) {
            return [];
        }

        $closed = MonthlyClosure::whereIn('period', $candidates)->pluck('period')->flip();

        return array_values(array_reverse(
            array_filter($candidates, fn (string $period) => ! $closed->has($period)),
        ));
    }

    /**
     * What the period selector of both clients needs, in one call.
     *
     * @return array{current: string, start_period: string|null, to_finalize: list<array{period: string, status: string}>, closed: list<array{period: string, status: string, closed_at: string, closed_by: string|null}>}
     */
    public function periods(): array
    {
        $closed = MonthlyClosure::with('closedBy')
            ->orderByDesc('period')
            ->limit(self::MAX_LISTED_PERIODS)
            ->get();

        return [
            'current' => $this->currentPeriod(),
            'start_period' => $this->startPeriod(),
            'to_finalize' => array_map(
                fn (string $period) => ['period' => $period, 'status' => 'to_finalize'],
                $this->periodsToFinalize(),
            ),
            'closed' => $closed->map(fn (MonthlyClosure $closure) => [
                'period' => $closure->period,
                'status' => 'closed',
                'closed_at' => $closure->closed_at->toIso8601String(),
                'closed_by' => $closure->closedBy?->name,
            ])->values()->all(),
        ];
    }

    public function statusOf(string $period): string
    {
        if ($this->isClosed($period)) {
            return 'closed';
        }

        return $period === $this->currentPeriod() ? 'current' : 'to_finalize';
    }

    /**
     * Everything the closing screen shows, and everything close() re-checks.
     *
     * Built from live data on every call — never cached, never trusted from a
     * client. A checklist loaded two minutes ago may already be stale.
     */
    public function checklist(string $period): array
    {
        $status = $this->statusOf($period);
        $closure = $status === 'closed' ? $this->closureFor($period) : null;

        $employees = $this->employeeRows($period);
        $workDays = $this->workDayRows($period);

        $unsettled = array_values(array_filter($employees, fn (array $row) => ! $row['settled']));
        $blocking = [];

        if ($period === $this->currentPeriod()) {
            $blocking[] = 'Le mois courant ne peut pas être clôturé.';
        } elseif ($period > $this->currentPeriod()) {
            $blocking[] = 'Un mois à venir ne peut pas être clôturé.';
        }

        $start = $this->startPeriod();
        if ($start === null) {
            $blocking[] = 'La clôture mensuelle n\'est pas activée sur cette installation.';
        } elseif ($period < $start) {
            $blocking[] = "Ce mois précède le démarrage de la clôture mensuelle ({$start}).";
        }

        if ($closure !== null) {
            $blocking[] = 'Ce mois est déjà clôturé.';
        }

        if ($workDays['open'] > 0) {
            $blocking[] = $workDays['open'] === 1
                ? 'Impossible de clôturer : 1 journée de caisse est encore ouverte.'
                : "Impossible de clôturer : {$workDays['open']} journées de caisse sont encore ouvertes.";
        }

        if ($unsettled !== []) {
            $count = count($unsettled);
            $blocking[] = $count === 1
                ? 'Impossible de clôturer : 1 employé n\'est pas soldé.'
                : "Impossible de clôturer : {$count} employés ne sont pas soldés.";
        }

        return [
            'period' => $period,
            'status' => $status,
            'can_close' => $blocking === [],
            'blocking_reasons' => $blocking,
            'employees' => $employees,
            'work_days' => $workDays,
            // Informational only, and deliberately so: partner payouts carry no
            // reliable period (partner_commission_payouts is ad-hoc, see its
            // migration docblock), so making them block a month would mean
            // inventing a partner payroll period. Left for a future version.
            'partner_information' => $this->partnerInformation($period),
            'closure' => $closure === null ? null : [
                'closed_at' => $closure->closed_at->toIso8601String(),
                'closed_by' => $closure->closedBy?->name,
                'notes' => $closure->notes,
            ],
            'totals' => $this->totals($employees),
        ];
    }

    /**
     * Closes the month, atomically.
     *
     * The whole checklist is rebuilt INSIDE the transaction: the client's
     * checkbox is a courtesy, not a control, and the state may have moved
     * since the screen was drawn. Two concurrent calls end with exactly one
     * closure — the loser gets a business error, never an SQL 500.
     */
    public function close(string $period, User $actor, ?string $notes = null): MonthlyClosure
    {
        try {
            return DB::transaction(function () use ($period, $actor, $notes) {
                $checklist = $this->checklist($period);

                if (! $checklist['can_close']) {
                    throw ValidationException::withMessages([
                        'period' => $checklist['blocking_reasons'][0] ?? 'Ce mois ne peut pas être clôturé.',
                    ]);
                }

                $closure = MonthlyClosure::create([
                    'period' => $period,
                    'closed_by_user_id' => $actor->id,
                    'closed_at' => now(),
                    'closing_report' => $this->snapshot($period, $actor, $checklist),
                    'notes' => $notes,
                ]);

                $this->activityLogger->log('monthly_closure.closed', $closure, [], [
                    'period' => $period,
                    'employees' => count($checklist['employees']),
                    'work_days' => $checklist['work_days']['total'],
                    'totals' => $checklist['totals'],
                ]);

                return $closure->load('closedBy');
            });
        } catch (QueryException $exception) {
            // The unique index caught a race between two closures of the same
            // month. Both callers deserve a business answer, not a 500.
            if ($this->isUniqueViolation($exception)) {
                throw ValidationException::withMessages([
                    'period' => 'Ce mois est déjà clôturé.',
                ]);
            }

            throw $exception;
        }
    }

    /**
     * Refuses any write that would land in — or move data into — a closed
     * month. Called by the EnsurePeriodOpen middleware, and safe to call with
     * null (an endpoint whose period cannot be determined is left alone).
     */
    public function assertPeriodOpen(?string $period): void
    {
        if ($period === null || ! $this->isClosed($period)) {
            return;
        }

        throw ValidationException::withMessages([
            'period' => 'Cette période est clôturée et ne peut plus être modifiée.',
        ]);
    }

    /**
     * Employees with a real financial situation this month.
     *
     * Not "commission > 0": an employee paid mid-month, or carrying an advance
     * that feeds into this month's payroll, has a situation here too and must
     * appear on the checklist even with no commission of their own.
     *
     * @return list<array<string, mixed>>
     */
    private function employeeRows(string $period): array
    {
        $rows = [];

        // `is_demo` : une commission du compte de validation Google Play
        // ne doit jamais apparaitre ici ni bloquer la cloture du mois.
        foreach (Employee::query()->where('is_company', false)->where('is_demo', false)->orderBy('name')->get() as $employee) {
            $preview = $this->payouts->preview($employee, $period);

            $hasSituation = $preview['commission_total'] > 0
                || $preview['paid_net_total'] > 0
                || $preview['paid_advances_total'] > 0
                || $preview['advances_outstanding'] > 0
                || $preview['already_paid'];

            if (! $hasSituation) {
                continue;
            }

            // Settled means "nothing left to hand over for this month". An
            // advance larger than the month's commission leaves net_amount at
            // 0 and rolls the surplus forward — that is the existing payroll
            // rule and it does NOT block the closure.
            $settled = $preview['net_amount'] <= 0;

            $rows[] = [
                'employee_id' => $preview['employee_id'],
                'employee_name' => $preview['employee_name'],
                'avatar_color' => $preview['avatar_color'],
                'earned' => $preview['commission_total'],
                'advances_applied' => $preview['paid_advances_total'],
                'payouts_total' => $preview['paid_net_total'],
                'remaining_to_pay' => $preview['net_amount'],
                // Surfaced so "✓ Soldé — avance reportée : 320 MAD" can be
                // shown without the reader thinking money went missing.
                'carry_forward_advance' => $settled ? $preview['advances_outstanding'] : 0.0,
                'advances_outstanding' => $preview['advances_outstanding'],
                'settled' => $settled,
            ];
        }

        return $rows;
    }

    /**
     * Cash days of the month. Uses `work_days.date` — the cash anchor — because
     * this is a question about cash days, not about commissions.
     */
    private function workDayRows(string $period): array
    {
        [$from, $to] = $this->bounds($period);

        // Bornes en datetime, pas en `toDateString()` : la colonne porte le
        // cast `date`, qui sérialise « 2026-08-31 00:00:00 ». Comparée à la
        // chaîne « 2026-08-31 », la dernière journée du mois tombait hors de
        // l'intervalle — et c'est précisément celle du 31 qu'on risque
        // d'oublier de clôturer.
        $days = WorkDay::whereBetween('date', [$from, $to])
            ->orderBy('date')
            ->get(['id', 'date', 'status', 'closed_at']);

        $open = $days->where('status', '!=', 'closed');

        return [
            'total' => $days->count(),
            'closed' => $days->count() - $open->count(),
            'open' => $open->count(),
            'all_closed' => $open->isEmpty(),
            'open_days' => $open->map(fn (WorkDay $day) => [
                'id' => $day->id,
                'date' => $day->date->toDateString(),
            ])->values()->all(),
        ];
    }

    /**
     * Partner commissions accrued this month and not yet paid. Informational
     * only — see the note in checklist().
     */
    private function partnerInformation(string $period): array
    {
        [$from, $to] = $this->bounds($period);

        $pending = PartnerCommission::with('partner:id,name')
            ->where('status', PartnerCommission::STATUS_VALIDATED)
            ->whereNull('partner_commission_payout_id')
            ->whereBetween('created_at', [$from, $to])
            ->get();

        return [
            'informational' => true,
            'pending_total' => round((float) $pending->sum('amount'), 2),
            'partners' => $pending->groupBy('partner_id')
                ->map(fn ($group) => [
                    'partner_id' => $group->first()->partner_id,
                    'partner_name' => $group->first()->partner?->name,
                    'amount' => round((float) $group->sum('amount'), 2),
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $employees
     */
    private function totals(array $employees): array
    {
        $sum = fn (string $key) => round(array_sum(array_column($employees, $key)), 2);

        return [
            'employees_count' => count($employees),
            'commission_total' => $sum('earned'),
            'payouts_total' => $sum('payouts_total'),
            'advances_applied_total' => $sum('advances_applied'),
            'remaining_total' => $sum('remaining_to_pay'),
            'carry_forward_total' => $sum('carry_forward_advance'),
        ];
    }

    /**
     * The frozen record. Complete enough that the history stays readable years
     * later, even after the underlying rows have moved on. Nothing secret,
     * nothing that is not already visible on the closing screen.
     */
    private function snapshot(string $period, User $actor, array $checklist): array
    {
        return [
            'period' => $period,
            'closed_at' => now()->toIso8601String(),
            'closed_by' => ['id' => $actor->id, 'name' => $actor->name],
            'employees' => $checklist['employees'],
            'work_days' => $checklist['work_days'],
            'partner_information' => $checklist['partner_information'],
            'totals' => $checklist['totals'],
        ];
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function bounds(string $period): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m', $period)->startOfMonth();

        return [$start->startOfDay(), $start->endOfMonth()->endOfDay()];
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        // 23000 covers MySQL/MariaDB and SQLite alike; 23505 is PostgreSQL.
        return in_array((string) ($exception->errorInfo[0] ?? ''), ['23000', '23505'], true);
    }
}
