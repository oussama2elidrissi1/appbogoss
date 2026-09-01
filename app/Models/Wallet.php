<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Le portefeuille d'un utilisateur.
 *
 * `balance` et `cash_fund_balance` sont des soldes matérialisés, jamais
 * modifiés à la main : seul WalletService les écrit, dans la même transaction
 * que la ligne de ledger correspondante. Ils ne sont pas `fillable` pour cette
 * raison — un `update(['balance' => ...])` égaré depuis un contrôleur casserait
 * la réconciliation sans laisser de trace.
 */
class Wallet extends Model
{
    use HasFactory;

    public const TYPE_ADMIN = 'admin';

    public const TYPE_SUPER_ADMIN = 'super_admin';

    protected $fillable = [
        'user_id',
        'type',
        'is_active',
    ];

    protected $casts = [
        'balance' => 'decimal:2',
        'cash_fund_balance' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(WalletTransaction::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    public function scopeAdmins(Builder $query): Builder
    {
        return $query->where('type', self::TYPE_ADMIN);
    }

    public function scopeSuperAdmins(Builder $query): Builder
    {
        return $query->where('type', self::TYPE_SUPER_ADMIN);
    }

    public function isSuperAdmin(): bool
    {
        return $this->type === self::TYPE_SUPER_ADMIN;
    }

    /** Disponible + fond de caisse : tout ce que ce portefeuille détient. */
    public function totalHeld(): float
    {
        return round((float) $this->balance + (float) $this->cash_fund_balance, 2);
    }
}
