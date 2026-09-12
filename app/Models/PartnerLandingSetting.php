<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * L'habillage de la page publique d'un partenaire. Absence d'enregistrement =
 * reglages par defaut : la page est active et porte les textes Bogosland.
 */
class PartnerLandingSetting extends Model
{
    protected $fillable = [
        'partner_id',
        'is_enabled',
        'title',
        'subtitle',
        'intro',
        'cover_image_url',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }
}
