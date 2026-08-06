<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'birth_date',
        'avatar_color',
        'loyalty_points',
        'notes',
        'last_visit_at',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'last_visit_at' => 'datetime',
        'loyalty_points' => 'integer',
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
}
