<?php

namespace App\Models;

use App\Services\PhoneNumberNormalizer;
use Illuminate\Auth\Authenticatable as AuthenticatableTrait;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Implements Authenticatable so the customer portal can log a Client in via
 * the `client` guard. Auth is phone + a password the customer chooses at
 * registration (App\Services\CustomerRegistrationService) — checked via
 * ClientLoginController for returning visits. No "remember me" (no
 * remember_token column), so login() is always called without its second arg.
 *
 * HasApiTokens is what lets the mobile app authenticate a customer with a
 * bearer token instead of a session cookie (`client-api` guard). It is only
 * safe because config/auth.php pins the `sanctum` staff guard to the `users`
 * provider — without that, Guard::hasValidProvider() would accept a Client
 * token on every staff route. See the comments there before touching either.
 */
class Client extends Model implements Authenticatable
{
    use AuthenticatableTrait;
    use HasApiTokens;
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

    /**
     * Name/email/phone search, format-blind on the phone: numbers were typed
     * in over months as "0668...", "+212 668...", "06-68…" — so on top of the
     * plain LIKE, the term's digits are matched against the stored phone with
     * its separators stripped in SQL. Nested REPLACE() rather than
     * REGEXP_REPLACE so the same query runs on MySQL (prod) and SQLite (tests).
     */
    public function scopeSearchTerm(Builder $query, string $search): Builder
    {
        return $query->where(function (Builder $sub) use ($search): void {
            $sub->where('name', 'like', '%'.$search.'%')
                ->orWhere('email', 'like', '%'.$search.'%')
                ->orWhere('phone', 'like', '%'.$search.'%');

            $digits = PhoneNumberNormalizer::searchDigits($search);
            if ($digits !== null) {
                $strippedPhone = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), '+', '')";
                $sub->orWhereRaw($strippedPhone.' LIKE ?', ['%'.$digits.'%'])
                    ->orWhere('phone_e164', 'like', '%'.$digits.'%');
            }
        });
    }

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
