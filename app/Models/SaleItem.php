<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class SaleItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'sale_id',
        'itemable_type',
        'itemable_id',
        'label',
        'quantity',
        'unit_price',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'quantity' => 'integer',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function itemable(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'itemable_type', 'itemable_id');
    }
}
