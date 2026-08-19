<?php

namespace App\Models;

use Illuminate\Auth\Authenticatable as AuthenticatableTrait;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Notifications\Notifiable;

/**
 * Implements Authenticatable so the customer portal can log a Client in via
 * the `client` guard. Auth is phone + a password the customer chooses at
 * registration (App\Services\CustomerRegistrationService) — checked via
 * ClientLoginController for returning visits. No "remember me" (no
 * remember_token column), so login() is always called without its second arg.
 */
class Client extends Model implements Authenticatable
{
    use AuthenticatableTrait;
    use HasFactory;
    use Notifiable;

    protected $fillable = [
        'partner_id',
        'created_by_user_id',
        'archived_at',
        'archived_by_user_id',
        'name',
        'email',
        'phone',
        'phone_e164',
        'phone_verified_at',
        'password',
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

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'archived_at' => 'datetime',
        'last_visit_at' => 'datetime',
        'loyalty_points' => 'integer',
        'phone_verified_at' => 'datetime',
        'password' => 'hashed',
        'registered_at' => 'datetime',
        'consent_terms_at' => 'datetime',
        'consent_marketing_at' => 'datetime',
    ];

    /** Null when the client belongs to BOGOSLAND's own shared pool. */
    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by_user_id');
    }

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

    public function reviews(): HasMany
    {
        return $this->hasMany(AppointmentReview::class);
    }
}
