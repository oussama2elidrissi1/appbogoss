<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Une depense. Deux origines, une seule table.
 *
 *  - `caisse` : la depense historique, rattachee a une journee de caisse. Elle
 *    est deja deduite du resultat de la journee, donc deja reflechie dans le
 *    credit du portefeuille. La debiter du wallet la compterait deux fois.
 *
 *  - `wallet` : la depense payee sur l'argent detenu par l'admin apres la
 *    cloture (assurance, batterie, tailleur...). Elle debite le portefeuille et
 *    n'a aucune journee de caisse.
 *
 * Les agregats de caisse doivent donc TOUJOURS passer par `caisse()`. C'est
 * volontairement explicite plutot qu'un global scope : une exclusion invisible
 * dans un rapport financier ne se retrouve plus six mois apres.
 */
class Expense extends Model
{
    use HasFactory;

    public const ORIGIN_CAISSE = 'caisse';

    public const ORIGIN_WALLET = 'wallet';

    protected $fillable = [
        'work_day_id',
        'origin',
        'wallet_id',
        'user_id',
        'label',
        'category',
        'amount',
        'spent_on',
        'reference',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'spent_on' => 'date',
    ];

    public function workDay(): BelongsTo
    {
        return $this->belongsTo(WorkDay::class);
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Les depenses de caisse — celles, et uniquement celles, qui entrent dans
     * les rapports de caisse et le dashboard.
     *
     * `origin` etant `caisse` par defaut en base, toutes les lignes anterieures
     * au portefeuille sont incluses sans qu'aucune n'ait ete reecrite.
     */
    public function scopeCaisse(Builder $query): Builder
    {
        return $query->where('origin', self::ORIGIN_CAISSE);
    }

    /** Les depenses payees sur un portefeuille. */
    public function scopeFromWallet(Builder $query): Builder
    {
        return $query->where('origin', self::ORIGIN_WALLET);
    }
}
