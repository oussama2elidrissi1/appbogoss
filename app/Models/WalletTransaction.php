<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Une ligne du ledger. Immuable.
 *
 * `UPDATED_AT = null` n'est pas une coquetterie : la table n'a pas de colonne
 * `updated_at` parce qu'une écriture financière ne se met pas à jour. Corriger,
 * c'est écrire un `ADJUSTMENT` inverse qui pointe sur la ligne fautive.
 */
class WalletTransaction extends Model
{
    public const UPDATED_AT = null;

    /** Résultat d'une journée de caisse clôturée, crédité automatiquement. */
    public const TYPE_CASH_REGISTER_RESULT = 'CASH_REGISTER_RESULT';

    /** Remise au patron : débit chez l'admin, crédit chez le super admin. */
    public const TYPE_TRANSFER_TO_SUPER_ADMIN = 'TRANSFER_TO_SUPER_ADMIN';

    /** Le chemin inverse : le patron renvoie de l'argent à un admin. */
    public const TYPE_TRANSFER_TO_ADMIN = 'TRANSFER_TO_ADMIN';

    /**
     * Apport du patron — de l'argent venu de l'extérieur du salon.
     *
     * C'est le SEUL type qui fait apparaître de l'argent sans qu'il vienne
     * d'un autre portefeuille ou d'une journée de caisse. Il n'a donc pas de
     * contrepartie, et il est réservé au Super Admin.
     */
    public const TYPE_OWNER_DEPOSIT = 'OWNER_DEPOSIT';

    /**
     * Paiement réel à un employé — salaire, commission, avance, prime.
     *
     * Le MOUVEMENT d'argent, à ne pas confondre avec l'OBLIGATION que sont
     * les commissions et les paies mensuelles. Le portefeuille dit ce qui est
     * sorti ; la paie dit ce qui est dû.
     */
    public const TYPE_EMPLOYEE_PAYMENT = 'EMPLOYEE_PAYMENT';

    /** Dépense payée sur l'argent détenu (assurance, batterie, tailleur...). */
    public const TYPE_EXPENSE = 'EXPENSE';

    /** Part du disponible mise de côté comme fond de caisse. */
    public const TYPE_CASH_FUND = 'CASH_FUND';

    /** Fond de caisse réintégré dans le disponible. */
    public const TYPE_CASH_FUND_RETURN = 'CASH_FUND_RETURN';

    /** Correction traçable — jamais une suppression. */
    public const TYPE_ADJUSTMENT = 'ADJUSTMENT';

    public const TYPES = [
        self::TYPE_CASH_REGISTER_RESULT,
        self::TYPE_TRANSFER_TO_SUPER_ADMIN,
        self::TYPE_TRANSFER_TO_ADMIN,
        self::TYPE_OWNER_DEPOSIT,
        self::TYPE_EMPLOYEE_PAYMENT,
        self::TYPE_EXPENSE,
        self::TYPE_CASH_FUND,
        self::TYPE_CASH_FUND_RETURN,
        self::TYPE_ADJUSTMENT,
    ];

    public const DIRECTION_IN = 'in';

    public const DIRECTION_OUT = 'out';

    /** Le solde touché : disponible, ou fond de caisse. */
    public const BUCKET_AVAILABLE = 'available';

    public const BUCKET_CASH_FUND = 'cash_fund';

    protected $fillable = [
        'wallet_id',
        'counterparty_wallet_id',
        'transfer_group',
        'type',
        'direction',
        'bucket',
        'amount',
        'balance_after',
        'cash_fund_after',
        'performed_by_user_id',
        'employee_id',
        'period',
        'source_type',
        'source_id',
        'reverses_transaction_id',
        'category',
        'reference',
        'description',
        'occurred_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance_after' => 'decimal:2',
        'cash_fund_after' => 'decimal:2',
        'occurred_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function counterpartyWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'counterparty_wallet_id');
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by_user_id');
    }

    /**
     * L'employé payé, sur un mouvement de type EMPLOYEE_PAYMENT. Nul partout
     * ailleurs — un résultat de caisse ou une remise au patron ne concerne
     * personne en particulier.
     */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** WorkDay, Expense... — d'où vient l'argent, ou vers quoi il est parti. */
    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function reverses(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reverses_transaction_id');
    }

    /** Montant signé : positif pour une entrée, négatif pour une sortie. */
    public function signedAmount(): float
    {
        return round(
            (float) $this->amount * ($this->direction === self::DIRECTION_IN ? 1 : -1),
            2,
        );
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }
}
