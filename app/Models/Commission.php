<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    public const STATUS_VALIDATED = 'validated';
    public const STATUS_CANCELLED = 'cancelled';

    /** Half of a coiffure tip, earned by the employee on top of the service. */
    public const TYPE_TIP = 'tip_percentage';

    protected $fillable = [
        'prestation_id',
        'prestation_item_id',
        'employee_id',
        'service_id',
        'tip_id',
        'rule_id',
        'type',
        'rate_or_amount',
        'base_amount',
        'amount',
        'status',
    ];

    protected $casts = [
        'rate_or_amount' => 'decimal:2',
        'base_amount' => 'decimal:2',
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

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function tip(): BelongsTo
    {
        return $this->belongsTo(Tip::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(EmployeeServiceCommission::class, 'rule_id');
    }
}
