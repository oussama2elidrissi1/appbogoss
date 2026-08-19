<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appointment extends Model
{
    use HasFactory;

    protected $fillable = [
        'client_id',
        'client_ids',
        'partner_id',
        'employee_id',
        'service_id',
        'starts_at',
        'ends_at',
        'status',
        'notes',
        'reservation_items',
        'people',
        'duration_override_minutes',
        'created_by_user_id',
        'confirmed_by_user_id',
        'cancelled_by_user_id',
        'cancelled_at',
        'cancellation_reason',
        'proposed_starts_at',
        'proposed_ends_at',
        'proposal_note',
        'proposal_status',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'reservation_items' => 'array',
        'client_ids' => 'array',
        'people' => 'array',
        'cancelled_at' => 'datetime',
        'proposed_starts_at' => 'datetime',
        'proposed_ends_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(AppointmentStatusLog::class)->orderBy('created_at');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by_user_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(AppointmentReview::class);
    }
}
