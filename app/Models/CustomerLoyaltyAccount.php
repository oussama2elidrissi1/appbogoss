<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerLoyaltyAccount extends Model
{
    public const STATUS_PENDING_VERIFICATION = 'pending_verification';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_DISABLED = 'disabled';
    public const STATUS_BLOCKED = 'blocked';

    protected $fillable = [
        'client_id',
        'loyalty_number',
        'points_balance',
        'status',
        'notes',
    ];

    protected $casts = [
        'points_balance' => 'integer',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    protected static function booted(): void
    {
        static::creating(function (self $account) {
            if (empty($account->loyalty_number)) {
                $account->loyalty_number = self::generateLoyaltyNumber();
            }
        });
    }

    /**
     * FID-2026-000123 — sequential within the year, starting from the
     * current row count. Collisions (e.g. a row was deleted, so the count
     * lands on an already-used number) are resolved by incrementing, not by
     * recomputing the same count again — recomputing would return the exact
     * same candidate forever and spin.
     */
    public static function generateLoyaltyNumber(): string
    {
        $prefix = app(\App\Services\LoyaltySettingsService::class)->get('loyalty_number_prefix', 'FID');
        $year = now()->year;
        $sequence = self::whereYear('created_at', $year)->count() + 1;

        do {
            $candidate = sprintf('%s-%d-%06d', $prefix, $year, $sequence);
            $sequence++;
        } while (self::where('loyalty_number', $candidate)->exists());

        return $candidate;
    }
}
