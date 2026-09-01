<?php

namespace App\Http\Resources;

use App\Services\WalletService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Le portefeuille et ses compteurs.
 *
 * Les totaux ne sont pas stockés : ils sont agrégés depuis le ledger à chaque
 * lecture, de sorte qu'ils ne peuvent pas diverger de l'historique affiché
 * juste en dessous. `reconciliation` expose la vérification elle-même — un
 * écran peut donc dire « les totaux correspondent aux mouvements » sans que
 * personne ait à le vérifier à la main.
 */
class WalletResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $service = app(WalletService::class);
        $summary = $service->summary($this->resource);

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'user_name' => $this->whenLoaded('user', fn () => $this->user?->name),
            'type' => $this->type,
            'is_active' => (bool) $this->is_active,
            ...$summary,
            'reconciliation' => $service->reconcile($this->resource),
        ];
    }
}
