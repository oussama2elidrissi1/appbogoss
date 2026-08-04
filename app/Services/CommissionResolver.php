<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Service;
use Carbon\Carbon;

/**
 * Resolves the commission owed on a single prestation line, in priority order:
 * an active employee+service rule for the given date, then the employee's flat
 * default rate, then nothing. Never called before payment confirmation — the
 * result is meant to be frozen onto the prestation item / commission row so a
 * later rule change never retroactively alters a historical commission.
 */
class CommissionResolver
{
    /**
     * @return array{type: string, value: float, rule_id: int|null, amount: float}
     */
    public function resolve(Employee $employee, ?Service $service, float $baseAmount, ?Carbon $date = null): array
    {
        $date = $date ?? Carbon::now();

        if ($service !== null) {
            $rule = EmployeeServiceCommission::query()
                ->where('employee_id', $employee->id)
                ->where('service_id', $service->id)
                ->where('is_active', true)
                ->whereDate('starts_on', '<=', $date)
                ->where(function ($query) use ($date) {
                    $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $date);
                })
                ->orderByDesc('starts_on')
                ->orderByDesc('id')
                ->first();

            if ($rule !== null) {
                return $this->computed($rule->type, (float) $rule->value, $baseAmount, $rule->id);
            }
        }

        if ($employee->default_commission_rate !== null) {
            return $this->computed('percentage', (float) $employee->default_commission_rate, $baseAmount, null);
        }

        return $this->computed('none', 0.0, $baseAmount, null);
    }

    /**
     * @return array{type: string, value: float, rule_id: int|null, amount: float}
     */
    private function computed(string $type, float $value, float $baseAmount, ?int $ruleId): array
    {
        $amount = match ($type) {
            'percentage' => round($baseAmount * $value / 100, 2),
            'fixed' => round($value, 2),
            default => 0.0,
        };

        return [
            'type' => $type,
            'value' => $value,
            'rule_id' => $ruleId,
            'amount' => $amount,
        ];
    }
}
