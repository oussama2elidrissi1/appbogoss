<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One admin "marquer comme payé" action on a partner's validated
 * commissions — mirrors CommissionPayout (employee payroll) but partners are
 * paid an ad-hoc, admin-selected set of commissions rather than a strict
 * monthly period, hence the explicit payment_method/reference (§21).
 */
class PartnerCommissionPayout extends Model
{
    protected $fillable = [
        'partner_id',
        'amount',
        'payment_method',
        'reference',
        'paid_by_user_id',
        'paid_at',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function paidBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by_user_id');
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(PartnerCommission::class, 'partner_commission_payout_id');
    }
}
