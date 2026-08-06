<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyReward extends Model
{
    public const STATUS_AVAILABLE = 'available';
    public const STATUS_RESERVED = 'reserved';
    public const STATUS_USED = 'used';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'client_id',
        'loyalty_program_id',
        'triggering_ledger_entry_id',
        'program_snapshot',
        'type',
        'status',
        'service_id',
        'value',
        'commission_basis',
        'commission_value',
        'reserved_prestation_id',
        'used_prestation_item_id',
        'generated_at',
        'expires_at',
        'used_at',
        'cancelled_at',
        'cancel_reason',
    ];

    protected $casts = [
        'program_snapshot' => 'array',
        'value' => 'decimal:2',
        'commission_value' => 'decimal:2',
        'generated_at' => 'datetime',
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(LoyaltyProgram::class, 'loyalty_program_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function reservedPrestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class, 'reserved_prestation_id');
    }

    public function usedPrestationItem(): BelongsTo
    {
        return $this->belongsTo(PrestationItem::class, 'used_prestation_item_id');
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_AVAILABLE)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now());
    }
}
