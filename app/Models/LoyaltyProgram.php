<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A single, fully-paramétrable loyalty rule. `config` carries every
 * type-specific parameter (thresholds, target service/category, reward
 * shape, rollover policy, etc.) as JSON — evaluated in PHP by LoyaltyEngine,
 * the same pattern already used elsewhere in this app for
 * payment_breakdown/service_categories/allowed_service_ids.
 */
class LoyaltyProgram extends Model
{
    public const TYPE_SERVICE_COUNT = 'service_count';
    public const TYPE_POINTS = 'points';
    public const TYPE_AMOUNT_SPENT = 'amount_spent';
    public const TYPE_VISIT_COUNT = 'visit_count';
    public const TYPE_BIRTHDAY = 'birthday';
    public const TYPE_CUSTOM = 'custom';

    protected $fillable = [
        'name',
        'description',
        'type',
        'is_active',
        'config',
        'max_rewards',
        'stackable',
        'priority',
        'commission_basis',
        'commission_value',
        'starts_on',
        'ends_on',
        'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'config' => 'array',
        'max_rewards' => 'integer',
        'stackable' => 'boolean',
        'priority' => 'integer',
        'commission_value' => 'decimal:2',
        'starts_on' => 'date',
        'ends_on' => 'date',
    ];

    public function progress(): HasMany
    {
        return $this->hasMany(LoyaltyProgramProgress::class);
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(LoyaltyLedgerEntry::class);
    }

    public function rewards(): HasMany
    {
        return $this->hasMany(LoyaltyReward::class);
    }
}
