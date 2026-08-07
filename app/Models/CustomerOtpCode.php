<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerOtpCode extends Model
{
    public const PURPOSE_LOGIN = 'login';

    protected $fillable = [
        'phone_e164',
        'client_id',
        'code_hash',
        'purpose',
        'channel',
        'attempts',
        'max_attempts',
        'expires_at',
        'consumed_at',
        'requested_ip',
    ];

    protected $casts = [
        'attempts' => 'integer',
        'max_attempts' => 'integer',
        'expires_at' => 'datetime',
        'consumed_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
