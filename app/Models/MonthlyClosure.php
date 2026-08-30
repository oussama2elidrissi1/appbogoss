<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A closed month. Its mere existence is the lock — there is no `status`
 * column, because a month has exactly two states and the second one is
 * "a row exists for this period".
 *
 * Nothing reopens a closure in this version: no `deleted_at`, no `reopened_at`.
 * Removing the lock would have to rewrite everything it froze.
 */
class MonthlyClosure extends Model
{
    use HasFactory;

    protected $fillable = [
        'period',
        'closed_by_user_id',
        'closed_at',
        'closing_report',
        'notes',
    ];

    protected $casts = [
        'closed_at' => 'datetime',
        'closing_report' => 'array',
    ];

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by_user_id');
    }
}
