<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionPlanService extends Model
{
    protected $fillable = [
        'subscription_plan_id',
        'service_id',
        'quota_period',
        'quota_per_period',
        'quota_total',
        'allow_rollover',
        'commission_basis',
        'commission_value',
    ];

    protected $casts = [
        'quota_per_period' => 'integer',
        'quota_total' => 'integer',
        'allow_rollover' => 'boolean',
        'commission_value' => 'decimal:2',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}
