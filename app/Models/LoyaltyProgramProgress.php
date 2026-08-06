<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyProgramProgress extends Model
{
    protected $fillable = [
        'client_id',
        'loyalty_program_id',
        'counter',
        'points_balance',
        'amount_accumulated',
        'last_activity_at',
    ];

    protected $casts = [
        'counter' => 'integer',
        'points_balance' => 'integer',
        'amount_accumulated' => 'decimal:2',
        'last_activity_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(LoyaltyProgram::class, 'loyalty_program_id');
    }
}
