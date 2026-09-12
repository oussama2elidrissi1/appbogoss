<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Une ligne de la vitrine d'un partenaire : un service du catalogue OU un
 * pack, avec ce que ce partenaire-la en montre.
 *
 * C'est une CONFIGURATION, pas une copie : `service_id` / `service_pack_id`
 * pointent vers le catalogue commun. Supprimer une offre retire la prestation
 * de cette vitrine et de nulle part ailleurs, et deux partenaires ne partagent
 * aucune ligne.
 *
 * Toutes les surcharges sont facultatives, et nulles veulent dire « comme au
 * catalogue » :
 *
 *  - `custom_price` remplace le prix affiche ET facture ;
 *  - `custom_commission_*` prime sur la grille PartnerServiceCommission pour
 *    cette offre uniquement (voir PartnerCommissionService) ;
 *  - `custom_title` / `custom_description` habillent la carte ;
 *  - `available_from` / `available_until` bornent la periode de visibilite.
 */
class PartnerOffering extends Model
{
    use HasFactory;

    public const KIND_SERVICE = 'service';
    public const KIND_PACK = 'pack';

    protected $fillable = [
        'partner_id',
        'kind',
        'service_id',
        'service_pack_id',
        'is_active',
        'is_featured',
        'sort_order',
        'custom_price',
        'custom_commission_type',
        'custom_commission_value',
        'custom_title',
        'custom_description',
        'available_from',
        'available_until',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
        'sort_order' => 'integer',
        'custom_price' => 'decimal:2',
        'custom_commission_value' => 'decimal:2',
        'available_from' => 'date',
        'available_until' => 'date',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function pack(): BelongsTo
    {
        return $this->belongsTo(ServicePack::class, 'service_pack_id');
    }

    /**
     * Ce qui est REELLEMENT montrable aujourd'hui : active, dans sa fenetre de
     * dates, et dont la cible existe encore et reste active au catalogue. Le
     * meme filtre sert a l'affichage et a la validation d'une reservation —
     * une seule regle, donc rien qui soit reservable sans etre visible.
     */
    public function scopeBookable(Builder $query, ?Carbon $on = null): Builder
    {
        $day = ($on ?? Carbon::now())->toDateString();

        return $query
            ->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('available_from')->orWhereDate('available_from', '<=', $day))
            ->where(fn (Builder $q) => $q->whereNull('available_until')->orWhereDate('available_until', '>=', $day))
            ->where(function (Builder $q) {
                $q->where(fn (Builder $service) => $service
                    ->where('kind', self::KIND_SERVICE)
                    ->whereHas('service', fn (Builder $s) => $s->where('is_active', true)))
                    ->orWhere(fn (Builder $pack) => $pack
                        ->where('kind', self::KIND_PACK)
                        ->whereHas('pack', fn (Builder $p) => $p->where('is_active', true)));
            });
    }

    /** Prix affiche et facture : la surcharge partenaire, sinon le catalogue. */
    public function effectivePrice(): float
    {
        if ($this->custom_price !== null) {
            return round((float) $this->custom_price, 2);
        }

        return $this->kind === self::KIND_PACK
            ? (float) ($this->pack?->effectivePrice() ?? 0)
            : round((float) ($this->service?->price ?? 0), 2);
    }

    /** Duree a reserver : celle du service, ou la somme de celles du pack. */
    public function durationMinutes(): int
    {
        return $this->kind === self::KIND_PACK
            ? (int) ($this->pack?->durationMinutes() ?? 0)
            : (int) ($this->service?->duration_minutes ?? 0);
    }

    /** Les services du catalogue que cette offre fait reellement realiser. */
    public function serviceIds(): array
    {
        if ($this->kind === self::KIND_SERVICE) {
            return $this->service_id !== null ? [$this->service_id] : [];
        }

        $this->loadMissing('pack.items');

        return $this->pack?->items
            ->flatMap(fn (ServicePackItem $item) => array_fill(0, max(1, (int) $item->quantity), $item->service_id))
            ->filter()
            ->values()
            ->all() ?? [];
    }

    public function title(): string
    {
        return $this->custom_title
            ?: ($this->kind === self::KIND_PACK ? (string) $this->pack?->name : (string) $this->service?->name);
    }
}
