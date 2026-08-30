<?php

namespace App\Http\Middleware;

use App\Models\Advance;
use App\Models\CommissionPayout;
use App\Models\Expense;
use App\Models\WorkDay;
use App\Services\MonthlyClosureService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses any write that touches a closed month.
 *
 * This is THE server-side lock. A disabled button in React or Flutter is a
 * courtesy; a closed month has to hold against a direct API call, a stale tab
 * left open since before the closure, and a replayed request.
 *
 * It checks BOTH sides of a modification, which is the part that matters:
 *
 *  - the period the row currently belongs to (resolved from the route-bound
 *    model), so a closed August expense cannot be edited;
 *  - the period the payload would move it to (resolved from the body), so a
 *    September advance cannot be dragged back into a closed August.
 *
 * Endpoints whose period cannot be determined are deliberately let through
 * untouched: the guard is applied route by route, and a route it cannot read
 * must not become a silent 422. That is also why nothing here throws on an
 * unparsable date — validation is the FormRequest's job, not this middleware's.
 */
class EnsurePeriodOpen
{
    /** Body fields that carry a period, by shape. */
    private const MONTH_FIELDS = ['period'];

    private const DATE_FIELDS = ['given_on', 'spent_on', 'date', 'before'];

    public function __construct(private readonly MonthlyClosureService $closures)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        foreach ($this->periodsTouchedBy($request) as $period) {
            $this->closures->assertPeriodOpen($period);
        }

        return $next($request);
    }

    /**
     * Every month this request would read-modify-write, deduplicated.
     *
     * @return list<string>
     */
    private function periodsTouchedBy(Request $request): array
    {
        $periods = [];

        foreach (self::MONTH_FIELDS as $field) {
            $periods[] = $this->asPeriod($request->input($field));
        }

        foreach (self::DATE_FIELDS as $field) {
            $periods[] = $this->asPeriodFromDate($request->input($field));
        }

        // A payload can also move a row by re-pointing it at another cash day.
        $periods[] = $this->workDayPeriod($request->input('work_day_id'));

        // The row as it stands today — the "before" side of an edit.
        $periods[] = $this->boundPeriod($request);

        return array_values(array_unique(array_filter($periods)));
    }

    private function boundPeriod(Request $request): ?string
    {
        $route = $request->route();
        if ($route === null) {
            return null;
        }

        foreach ($route->parameters() as $parameter) {
            $period = match (true) {
                $parameter instanceof Advance => $this->asPeriodFromDate($parameter->given_on),
                $parameter instanceof Expense => $this->asPeriodFromDate($parameter->spent_on),
                $parameter instanceof CommissionPayout => $this->asPeriod($parameter->period),
                $parameter instanceof WorkDay => $this->asPeriodFromDate($parameter->date),
                default => null,
            };

            if ($period !== null) {
                return $period;
            }
        }

        return null;
    }

    private function workDayPeriod(mixed $workDayId): ?string
    {
        if (! is_numeric($workDayId)) {
            return null;
        }

        $date = WorkDay::whereKey((int) $workDayId)->value('date');

        return $date === null ? null : $this->asPeriodFromDate($date);
    }

    private function asPeriod(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{4}-\d{2}$/', $value) === 1 ? $value : null;
    }

    private function asPeriodFromDate(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m');
        }

        if (! is_string($value) || preg_match('/^(\d{4}-\d{2})-\d{2}/', $value, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }
}
