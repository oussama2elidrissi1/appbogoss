<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per paid PrestationItem belonging to a partner-owned client — the
 * real, earned commission ledger (as opposed to Partner::commissionFor(),
 * which only ever computes a pre-payment estimate). Created by
 * PartnerCommissionService::accrueForPrestation() at the moment
 * PrestationService::confirmPayment() actually moves money.
 */
class PartnerCommission extends Model
{
    public const STATUS_VALIDATED = 'validated';
    public const STATUS_PAID = 'paid';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'partner_id',
        'client_id',
        'prestation_id',
        'prestation_item_id',
        'service_id',
        'rule_id',
        'type',
        'rate_or_amount',
        'base_amount',
        'amount',
        'status',
        'partner_commission_payout_id',
    ];

    protected $casts = [
        'rate_or_amount' => 'decimal:2',
        'base_amount' => 'decimal:2',
        'amount' => 'decimal:2',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function prestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class);
    }

    public function prestationItem(): BelongsTo
    {
        return $this->belongsTo(PrestationItem::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(PartnerServiceCommission::class, 'rule_id');
    }

    public function payout(): BelongsTo
    {
        return $this->belongsTo(PartnerCommissionPayout::class, 'partner_commission_payout_id');
    }
}
