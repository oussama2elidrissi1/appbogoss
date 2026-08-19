<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeSupportConversation extends Model
{
    public const STATUS_NEW = 'nouveau';
    public const STATUS_IN_PROGRESS = 'en_cours';
    public const STATUS_RESOLVED = 'resolu';
    public const STATUS_CLOSED = 'ferme';

    public const STATUSES = [
        self::STATUS_NEW,
        self::STATUS_IN_PROGRESS,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
    ];

    protected $fillable = [
        'employee_id',
        'subject',
        'category',
        'status',
        'employee_last_read_at',
        'admin_last_read_at',
        'last_message_at',
    ];

    protected $casts = [
        'employee_last_read_at' => 'datetime',
        'admin_last_read_at' => 'datetime',
        'last_message_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(EmployeeSupportMessage::class, 'conversation_id')->orderBy('created_at');
    }
}
