<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * §23-25 — a partner ⇄ BOGOSLAND support thread. Read state is tracked as
 * two plain timestamps (partner_last_read_at / admin_last_read_at) rather
 * than per-message receipts — enough for an unread badge, no N+1 table.
 */
class SupportConversation extends Model
{
    public const STATUS_NEW = 'nouveau';
    public const STATUS_IN_PROGRESS = 'en_cours';
    public const STATUS_AWAITING_PARTNER = 'en_attente_partenaire';
    public const STATUS_RESOLVED = 'resolu';
    public const STATUS_CLOSED = 'ferme';

    public const STATUSES = [
        self::STATUS_NEW,
        self::STATUS_IN_PROGRESS,
        self::STATUS_AWAITING_PARTNER,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
    ];

    protected $fillable = [
        'partner_id',
        'subject',
        'status',
        'partner_last_read_at',
        'admin_last_read_at',
        'last_message_at',
    ];

    protected $casts = [
        'partner_last_read_at' => 'datetime',
        'admin_last_read_at' => 'datetime',
        'last_message_at' => 'datetime',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SupportMessage::class, 'conversation_id')->orderBy('created_at');
    }
}
