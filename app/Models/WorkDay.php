<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkDay extends Model
{
    use HasFactory;

    protected $fillable = [
        'date',
        'opened_by_user_id',
        'opening_balance',
        'status',
        'closed_at',
        'closing_report',
        'closing_balance_actual',
        'closing_variance',
        'closing_comment',
        'notes',
    ];

    protected $casts = [
        'date' => 'date',
        'opening_balance' => 'decimal:2',
        'closed_at' => 'datetime',
        'closing_report' => 'array',
        'closing_balance_actual' => 'decimal:2',
        'closing_variance' => 'decimal:2',
    ];

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    public function advances(): HasMany
    {
        return $this->hasMany(Advance::class);
    }

    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'work_day_employees')
            ->withPivot('present')
            ->withTimestamps();
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by_user_id');
    }
}
