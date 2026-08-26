<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One installment collected on a partially-paid subscription (§16). The
 * matching Sale is what puts the money in the day's totals; this row is the
 * subscription-side ledger entry. A payment whose sale was voided no longer
 * counts toward the balance (see SubscriptionService::paymentStatus()).
 */
class SubscriptionPayment extends Model
{
    protected $fillable = [
        'client_subscription_id',
        'sale_id',
        'amount',
        'payment_method',
        'collected_by_user_id',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(ClientSubscription::class, 'client_subscription_id');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function collectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collected_by_user_id');
    }
}
