<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerLoyaltyAccount extends Model
{
    public const STATUS_PENDING_VERIFICATION = 'pending_verification';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_DISABLED = 'disabled';
    public const STATUS_BLOCKED = 'blocked';

    protected $fillable = [
        'client_id',
        'points_balance',
        'status',
        'notes',
    ];

    protected $casts = [
        'points_balance' => 'integer',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
