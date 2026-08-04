<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrestationStatusLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'prestation_id',
        'from_status',
        'to_status',
        'user_id',
        'reason',
    ];

    public function prestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
