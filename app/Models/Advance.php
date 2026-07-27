<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Advance extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'work_day_id',
        'amount',
        'reason',
        'given_on',
        'settled_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'given_on' => 'date',
        'settled_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('settled_at');
    }
}
