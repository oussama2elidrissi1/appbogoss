<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    protected $guard_name = 'web';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_active',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'is_active' => 'boolean',
    ];

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    /**
     * Le portefeuille du compte. Cree a la demande par WalletService, jamais
     * par une migration : un portefeuille naissant vaut 0 et le reste tant
     * qu'aucune journee de caisse du 1er septembre 2026 ou plus tard n'a ete
     * cloturee.
     */
    public function wallet(): HasOne
    {
        return $this->hasOne(Wallet::class);
    }

    public function partner(): HasOne
    {
        return $this->hasOne(Partner::class);
    }
}
