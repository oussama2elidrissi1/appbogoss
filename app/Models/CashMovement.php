<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashMovement extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'work_day_id',
        'user_id',
        'type',
        'amount',
        'label',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
