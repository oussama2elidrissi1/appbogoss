<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Une avance sur salaire. Deux origines, une seule table.
 *
 *  - `caisse` : sortie du tiroir, rattachée à une journée. Elle est DÉJÀ
 *    déduite du résultat de cette journée, donc déjà retirée du crédit reçu
 *    par le portefeuille.
 *  - `wallet` : payée sur l'argent détenu par l'admin, sans journée de caisse.
 *
 * Dans les deux cas c'est une OBLIGATION de l'employé, et
 * `CommissionPayoutService` la nette à la paie sans se soucier de l'origine.
 * Seuls les agrégats de CAISSE doivent filtrer, via `caisse()`.
 */
class Advance extends Model
{
    use HasFactory;
    use SoftDeletes;

    public const ORIGIN_CAISSE = 'caisse';

    public const ORIGIN_WALLET = 'wallet';

    protected $fillable = [
        'employee_id',
        'work_day_id',
        'origin',
        'amount',
        'reason',
        'given_on',
        'settled_at',
        'commission_payout_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'given_on' => 'date',
        'settled_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function commissionPayout(): BelongsTo
    {
        return $this->belongsTo(CommissionPayout::class);
    }

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('settled_at');
    }

    /**
     * Les avances sorties du tiroir — celles, et uniquement celles, qui
     * entrent dans les rapports de caisse.
     *
     * `origin` valant `caisse` par defaut en base, toutes les lignes
     * anterieures au portefeuille sont incluses sans qu'aucune n'ait ete
     * reecrite.
     */
    public function scopeCaisse(Builder $query): Builder
    {
        return $query->where('origin', self::ORIGIN_CAISSE);
    }

    /** Les avances payees sur un portefeuille. */
    public function scopeFromWallet(Builder $query): Builder
    {
        return $query->where('origin', self::ORIGIN_WALLET);
    }
}
