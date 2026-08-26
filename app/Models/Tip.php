<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Pourboire — voluntary client money for one employee, tied to an invoice
 * (and optionally one of its lines). Never part of Sale.total, never part of
 * a commission: the two concepts stay in separate tables by design (§40).
 */
class Tip extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'prestation_id',
        'prestation_item_id',
        'employee_id',
        'work_day_id',
        'amount',
        'payment_method',
        'notes',
        'created_by_user_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function prestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class);
    }

    public function prestationItem(): BelongsTo
    {
        return $this->belongsTo(PrestationItem::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
