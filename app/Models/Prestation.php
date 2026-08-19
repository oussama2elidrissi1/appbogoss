<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Prestation extends Model
{
    use SoftDeletes;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_SERVICES_DONE = 'services_done';
    public const STATUS_PENDING_PAYMENT = 'pending_payment';
    public const STATUS_PAID = 'paid';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_REFUNDED = 'refunded';

    protected $fillable = [
        'reference',
        'work_day_id',
        'client_id',
        'client_label',
        'employee_id',
        'created_by_user_id',
        'status',
        'subtotal',
        'discount_percent',
        'discount_amount',
        'total',
        'payment_method',
        'payment_breakdown',
        'amount_received',
        'change_given',
        'notes',
        'validated_at',
        'validated_by_user_id',
        'confirmed_at',
        'confirmed_by_user_id',
        'cancelled_at',
        'cancelled_by_user_id',
        'cancel_reason',
        'refunded_at',
        'refunded_by_user_id',
        'refund_reason',
        'sale_id',
        'print_count',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total' => 'decimal:2',
        'amount_received' => 'decimal:2',
        'change_given' => 'decimal:2',
        'payment_breakdown' => 'array',
        'validated_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'refunded_at' => 'datetime',
        'print_count' => 'integer',
    ];

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function validatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by_user_id');
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by_user_id');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PrestationItem::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(PrestationStatusLog::class)->orderBy('created_at');
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(AppointmentReview::class);
    }

    public function isEditableByEmployee(): bool
    {
        return in_array($this->status, [self::STATUS_DRAFT, self::STATUS_IN_PROGRESS, self::STATUS_SERVICES_DONE], true);
    }
}
