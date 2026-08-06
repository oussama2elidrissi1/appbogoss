<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientSubscriptionUsage extends Model
{
    public const STATUS_RESERVED = 'reserved';
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_VOIDED = 'voided';

    protected $fillable = [
        'client_subscription_id',
        'subscription_plan_service_id',
        'status',
        'reserved_prestation_id',
        'prestation_item_id',
        'used_on',
        'period_key',
        'sequence_in_period',
        'sequence_total',
        'exception_override',
        'override_reason',
        'override_by_user_id',
    ];

    protected $casts = [
        'used_on' => 'date',
        'sequence_in_period' => 'integer',
        'sequence_total' => 'integer',
        'exception_override' => 'boolean',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(ClientSubscription::class, 'client_subscription_id');
    }

    public function planService(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlanService::class, 'subscription_plan_service_id');
    }

    public function reservedPrestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class, 'reserved_prestation_id');
    }

    public function prestationItem(): BelongsTo
    {
        return $this->belongsTo(PrestationItem::class);
    }
}
