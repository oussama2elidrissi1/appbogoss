<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A recorded monthly commission payment to an employee — commission earned
 * that month minus whatever outstanding salary advances were netted against
 * it. One row per employee per calendar month (unique constraint), so it
 * also acts as the guard against paying the same month twice.
 */
class CommissionPayout extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'period',
        'commission_total',
        'advances_deducted',
        'net_amount',
        'paid_by_user_id',
        'paid_at',
        'notes',
    ];

    protected $casts = [
        'commission_total' => 'decimal:2',
        'advances_deducted' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function paidBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by_user_id');
    }

    public function advances(): HasMany
    {
        return $this->hasMany(Advance::class);
    }
}
