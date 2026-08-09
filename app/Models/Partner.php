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

    protected $fillable = [
        'name',
        'contact_name',
        'phone',
        'email',
        'address',
        'notes',
        'is_active',
        'user_id',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

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

    /**
     * Commission earned by the partner for one service at a given price.
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
