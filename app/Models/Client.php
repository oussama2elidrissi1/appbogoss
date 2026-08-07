<?php

namespace App\Models;

use Illuminate\Auth\Authenticatable as AuthenticatableTrait;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Notifications\Notifiable;

/**
 * Implements Authenticatable so the customer portal can log a Client in via
 * the `client` guard (Auth::guard('client')->login($client)) after OTP
 * verification. There is no password — getAuthPassword()/attempt() are
 * never used, only direct login().
 */
class Client extends Model implements Authenticatable
{
    use AuthenticatableTrait;
    use HasFactory;
    use Notifiable;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'phone_e164',
        'phone_verified_at',
        'birth_date',
        'gender',
        'avatar_color',
        'loyalty_points',
        'notes',
        'last_visit_at',
        'registered_at',
        'consent_terms_at',
        'consent_marketing_at',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'last_visit_at' => 'datetime',
        'loyalty_points' => 'integer',
        'phone_verified_at' => 'datetime',
        'registered_at' => 'datetime',
        'consent_terms_at' => 'datetime',
        'consent_marketing_at' => 'datetime',
    ];

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function prestations(): HasMany
    {
        return $this->hasMany(Prestation::class);
    }

    public function loyaltyAccount(): HasOne
    {
        return $this->hasOne(CustomerLoyaltyAccount::class);
    }

    public function loyaltyProgress(): HasMany
    {
        return $this->hasMany(LoyaltyProgramProgress::class);
    }

    public function loyaltyRewards(): HasMany
    {
        return $this->hasMany(LoyaltyReward::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(ClientSubscription::class);
    }

    public function otpCodes(): HasMany
    {
        return $this->hasMany(CustomerOtpCode::class);
    }

    public function qrTokens(): HasMany
    {
        return $this->hasMany(ClientQrToken::class);
    }
}
