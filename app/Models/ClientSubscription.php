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

    public const STATUS_SUSPENDED = 'suspended';

    protected $fillable = [
        'client_id',
        'subscription_plan_id',
        'renewed_from_id',
        'plan_snapshot',
        'total_amount',
        'status',
        'purchased_at',
        'starts_on',
        'ends_on',
        'sale_id',
        'qr_token',
        'purchase_prestation_id',
        'cancelled_at',
        'cancel_reason',
        'suspension_starts_on',
        'suspension_ends_on',
        'suspension_reason',
    ];

    protected $casts = [
        'plan_snapshot' => 'array',
        'total_amount' => 'decimal:2',
        'purchased_at' => 'datetime',
        'starts_on' => 'date',
        'ends_on' => 'date',
        'cancelled_at' => 'datetime',
        'suspension_starts_on' => 'date',
        'suspension_ends_on' => 'date',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function renewedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'renewed_from_id');
    }

    public function renewals(): HasMany
    {
        return $this->hasMany(self::class, 'renewed_from_id');
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

    public function payments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE)->whereDate('ends_on', '<', now());
    }
}
