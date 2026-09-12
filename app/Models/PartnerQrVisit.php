<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Une VISITE de la page QR d'un partenaire — pas un affichage.
 *
 * La cle est `visitor_key`, empreinte anonyme d'une session : le meme
 * visiteur qui recharge la page incremente `hits` et repousse
 * `last_seen_at`, il ne cree pas une seconde visite. C'est ce qui rend le
 * taux de conversion honnete.
 *
 * `appointment_id` / `converted_at` referment la boucle : on sait quelle
 * visite a donne quelle reservation, et une visite ne convertit qu'une fois.
 */
class PartnerQrVisit extends Model
{
    protected $fillable = [
        'partner_id',
        'partner_qr_token_id',
        'visitor_key',
        'hits',
        'first_seen_at',
        'last_seen_at',
        'appointment_id',
        'converted_at',
    ];

    protected $casts = [
        'hits' => 'integer',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'converted_at' => 'datetime',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function token(): BelongsTo
    {
        return $this->belongsTo(PartnerQrToken::class, 'partner_qr_token_id');
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }
}
