<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrestationItem extends Model
{
    protected $fillable = [
        'prestation_id',
        'service_id',
        'product_id',
        'employee_id',
        'label',
        'quantity',
        'unit_price',
        'discount_amount',
        'discount_reason',
        'duration_minutes',
        'notes',
        'beneficiary_name',
        'commission_type',
        'commission_value',
        'commission_amount',
        'commission_rule_id',
        'loyalty_reward_id',
        'client_subscription_id',
        'is_free',
        'public_price',
        'commission_basis',
        'commission_base_override',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'duration_minutes' => 'integer',
        'commission_value' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'is_free' => 'boolean',
        'public_price' => 'decimal:2',
        'commission_base_override' => 'decimal:2',
    ];

    public function prestation(): BelongsTo
    {
        return $this->belongsTo(Prestation::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function commissionRule(): BelongsTo
    {
        return $this->belongsTo(EmployeeServiceCommission::class, 'commission_rule_id');
    }

    public function loyaltyReward(): BelongsTo
    {
        return $this->belongsTo(LoyaltyReward::class);
    }

    public function clientSubscription(): BelongsTo
    {
        return $this->belongsTo(ClientSubscription::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function lineTotal(): float
    {
        return round((float) $this->quantity * (float) $this->unit_price, 2);
    }

    /**
     * Ligne qui appartient au comptoir et non à un employé : produit vendu,
     * ou service catalogué boisson/vente/vitrine. La caisse la range dans
     * « Ventes » (société) et jamais dans le CA d'un employé — l'espace
     * employé lit la MÊME règle ici, sinon les deux écrans divergent.
     */
    public function isRegisterSale(): bool
    {
        return $this->product_id !== null
            || in_array($this->service?->category, ['boisson', 'vente', 'vitrine'], true);
    }

    /**
     * Caisse V2 only: line total after the line-level discount. V1 code keeps
     * calling lineTotal() and never sets discount_amount, so its figures are
     * untouched.
     */
    public function effectiveLineTotal(): float
    {
        $discount = min((float) ($this->discount_amount ?? 0), $this->lineTotal());

        return round(max(0.0, $this->lineTotal() - $discount), 2);
    }
}
