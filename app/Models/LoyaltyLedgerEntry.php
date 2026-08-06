<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Append-only ledger of every loyalty accrual/reversal. The unique index on
 * (sourceable_type, sourceable_id, loyalty_program_id, direction) is the
 * idempotency guarantee: LoyaltyEngine always inserts via insertOrIgnore and
 * checks the affected-row count, so a duplicate call (double click, retry)
 * never double-counts.
 */
class LoyaltyLedgerEntry extends Model
{
    const UPDATED_AT = null;

    public const DIRECTION_ACCRUAL = 'accrual';
    public const DIRECTION_REVERSAL = 'reversal';

    protected $fillable = [
        'client_id',
        'loyalty_program_id',
        'direction',
        'metric',
        'delta',
        'sourceable_type',
        'sourceable_id',
        'reason',
        'created_by_user_id',
    ];

    protected $casts = [
        'delta' => 'decimal:2',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(LoyaltyProgram::class, 'loyalty_program_id');
    }

    public function sourceable(): MorphTo
    {
        return $this->morphTo();
    }
}
