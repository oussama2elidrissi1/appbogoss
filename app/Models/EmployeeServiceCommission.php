<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeServiceCommission extends Model
{
    protected $fillable = [
        'employee_id',
        'service_id',
        'type',
        'value',
        'starts_on',
        'ends_on',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'value' => 'decimal:2',
        'starts_on' => 'date',
        'ends_on' => 'date',
        'is_active' => 'boolean',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}
