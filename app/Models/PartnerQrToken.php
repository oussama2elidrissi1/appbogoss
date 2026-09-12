<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Le jeton public d'un partenaire — ce que son QR encode, et rien d'autre.
 *
 * Meme patron que ClientQrToken : revoque-et-remplace. Regenerer ne supprime
 * pas l'ancien jeton, il l'horodate dans `revoked_at`. Les affiches deja
 * imprimees cessent donc d'attribuer quoi que ce soit, sans effacer la trace
 * de ce qui a ete distribue.
 *
 * L'URL publique est /p/{token} : l'identifiant numerique du partenaire n'y
 * figure jamais, et le jeton est tire au sort sur 64 caracteres — il ne
 * s'enumere pas.
 */
class PartnerQrToken extends Model
{
    use HasFactory;

    protected $fillable = [
        'partner_id',
        'token',
        'revoked_at',
    ];

    protected $casts = [
        'revoked_at' => 'datetime',
    ];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }
}
