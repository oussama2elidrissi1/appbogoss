<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'name',
        'description',
        'price',
        'duration_value',
        'duration_unit',
        'is_active',
        'allow_suspension',
        'allow_renewal',
        'notes',
        'allowed_days',
        'time_start',
        'time_end',
        'max_per_day',
        'max_per_week',
        'max_per_month',
        'min_interval_minutes',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'duration_value' => 'integer',
        'is_active' => 'boolean',
        'allow_suspension' => 'boolean',
        'allow_renewal' => 'boolean',
        'allowed_days' => 'array',
        'max_per_day' => 'integer',
        'max_per_week' => 'integer',
        'max_per_month' => 'integer',
        'min_interval_minutes' => 'integer',
    ];

    public function services(): HasMany
    {
        return $this->hasMany(SubscriptionPlanService::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(ClientSubscription::class);
    }

    /**
     * Calendar-accurate end date from a start date — addDays/addWeeks/addMonths
     * per duration_unit, never a naive "* N days" approximation (a 3-month plan
     * bought Jan 31 must land on Apr 30, not 90 days later).
     */
    public function computeEndsOn(\Carbon\Carbon $startsOn): \Carbon\Carbon
    {
        return match ($this->duration_unit) {
            'days' => $startsOn->copy()->addDays($this->duration_value),
            'weeks' => $startsOn->copy()->addWeeks($this->duration_value),
            default => $startsOn->copy()->addMonths($this->duration_value),
        };
    }
}
