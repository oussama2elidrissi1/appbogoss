<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrestationItem extends Model
{
    protected $fillable = [
        'prestation_id',
        'service_id',
        'label',
        'quantity',
        'unit_price',
        'duration_minutes',
        'notes',
        'commission_type',
        'commission_value',
        'commission_amount',
        'commission_rule_id',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'duration_minutes' => 'integer',
        'commission_value' => 'decimal:2',
        'commission_amount' => 'decimal:2',
    ];

    public function prestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function commissionRule(): BelongsTo
    {
        return $this->belongsTo(EmployeeServiceCommission::class, 'commission_rule_id');
    }

    public function lineTotal(): float
    {
        return round((float) $this->quantity * (float) $this->unit_price, 2);
    }
}
