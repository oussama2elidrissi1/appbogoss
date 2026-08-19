<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * External business partner (hotel, riad, guide…) allowed to book
 * reservations into the salon's agenda through their own login account.
 * Their remuneration is defined per service via PartnerServiceCommission.
 */
class Partner extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_DISABLED = 'disabled';

    protected $fillable = [
        'name',
        'trade_name',
        'legal_name',
        'ice',
        'contact_name',
        'phone',
        'email',
        'address',
        'city',
        'country',
        'logo_url',
        'notes',
        'payment_holder_name',
        'payment_bank_name',
        'payment_iban',
        'payment_method_preference',
        'is_active',
        'status',
        'user_id',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * `is_active` stays the authoritative boolean every existing query reads
     * (Partner::where('is_active', true), restrictedPartner(), PartnerResource)
     * — kept in lockstep with the richer `status` whichever one is set.
     */
    protected static function booted(): void
    {
        static::saving(function (Partner $partner) {
            if ($partner->isDirty('status') && ! $partner->isDirty('is_active')) {
                $partner->is_active = $partner->status === self::STATUS_ACTIVE;
            } elseif ($partner->isDirty('is_active') && ! $partner->isDirty('status')) {
                $partner->status = $partner->is_active ? self::STATUS_ACTIVE : self::STATUS_DISABLED;
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(PartnerServiceCommission::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function clients(): HasMany
    {
        return $this->hasMany(Client::class);
    }

    public function partnerCommissions(): HasMany
    {
        return $this->hasMany(PartnerCommission::class);
    }

    public function commissionPayouts(): HasMany
    {
        return $this->hasMany(PartnerCommissionPayout::class);
    }

    /** Only an active partner may book, browse clients, or otherwise use the portal. */
    public function canOperate(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /**
     * Commission earned by the partner for one service at a given price —
     * used only for the "commission estimée" preview (pre-payment). Real,
     * earned commission is the persisted PartnerCommission ledger.
     */
    public function commissionFor(int $serviceId, float $price): float
    {
        $rule = $this->commissions->firstWhere('service_id', $serviceId);
        if (! $rule) {
            return 0.0;
        }

        return match ($rule->type) {
            'percentage' => round($price * (float) $rule->value / 100, 2),
            'fixed' => round((float) $rule->value, 2),
            default => 0.0,
        };
    }
}
