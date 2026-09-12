<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Un PACK : plusieurs prestations du catalogue vendues ensemble a un prix
 * d'ensemble (« Pack Premium : coupe + barbe + soin, 250 DH »).
 *
 * Un pack ne duplique aucun service — il les REFERENCE via
 * `service_pack_items`. Changer le prix d'une coupe au catalogue n'a donc
 * aucun effet sur le prix du pack, qui est un prix negocie a part, mais la
 * composition reste toujours celle du vrai catalogue.
 *
 * Duree : la somme des durees des services inclus, quantites comprises. Elle
 * n'est pas stockee, pour qu'elle suive le catalogue sans jamais deriver.
 */
class ServicePack extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'image_url',
        'price',
        'promotional_price',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'promotional_price' => 'decimal:2',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(ServicePackItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function offerings(): HasMany
    {
        return $this->hasMany(PartnerOffering::class);
    }

    /** Le prix reellement paye : le promotionnel s'il existe, sinon le prix. */
    public function effectivePrice(): float
    {
        return round((float) ($this->promotional_price ?? $this->price), 2);
    }

    /** Duree totale, quantites comprises — lue au catalogue, jamais figee. */
    public function durationMinutes(): int
    {
        $this->loadMissing('items.service');

        return (int) $this->items->sum(
            fn (ServicePackItem $item) => (int) ($item->service?->duration_minutes ?? 0) * max(1, (int) $item->quantity),
        );
    }
}
