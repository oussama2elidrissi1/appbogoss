<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'work_day_id',
        'client_id',
        'client_label',
        'employee_id',
        'category',
        'total',
        'commission_amount',
        'payment_method',
    ];

    protected $casts = [
        'total' => 'decimal:2',
        'commission_amount' => 'decimal:2',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }
}
