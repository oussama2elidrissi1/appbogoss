<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClientSubscription extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'client_id',
        'subscription_plan_id',
        'plan_snapshot',
        'status',
        'purchased_at',
        'starts_on',
        'ends_on',
        'sale_id',
        'purchase_prestation_id',
        'cancelled_at',
        'cancel_reason',
    ];

    protected $casts = [
        'plan_snapshot' => 'array',
        'purchased_at' => 'datetime',
        'starts_on' => 'date',
        'ends_on' => 'date',
        'cancelled_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function purchasePrestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class, 'purchase_prestation_id');
    }

    public function usages(): HasMany
    {
        return $this->hasMany(ClientSubscriptionUsage::class);
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE)->whereDate('ends_on', '<', now());
    }
}
