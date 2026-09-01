<?php

namespace App\Http\Resources;

use App\Models\Expense;
use App\Models\WorkDay;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Une ligne d'historique, telle que la lit un humain.
 *
 * `signed_amount` est fourni à côté de `amount` : le client n'a pas à
 * réinterpréter `direction` pour savoir dans quel sens l'argent est allé, et
 * deux clients (web et mobile) ne peuvent donc pas en tirer deux signes
 * différents.
 */
class WalletTransactionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'wallet_id' => $this->wallet_id,
            'counterparty_wallet_id' => $this->counterparty_wallet_id,
            'counterparty_name' => $this->whenLoaded(
                'counterpartyWallet',
                fn () => $this->counterpartyWallet?->user?->name,
            ),
            'transfer_group' => $this->transfer_group,
            'type' => $this->type,
            'type_label' => $this->typeLabel(),
            'direction' => $this->direction,
            'bucket' => $this->bucket,
            'amount' => (float) $this->amount,
            'signed_amount' => $this->resource->signedAmount(),
            'balance_after' => (float) $this->balance_after,
            'cash_fund_after' => (float) $this->cash_fund_after,
            'category' => $this->category,
            'reference' => $this->reference,
            'description' => $this->description,
            'performed_by' => $this->whenLoaded('performedBy', fn () => $this->performedBy?->name),
            'performed_by_user_id' => $this->performed_by_user_id,
            'reverses_transaction_id' => $this->reverses_transaction_id,
            'source' => $this->source(),
            'occurred_at' => $this->occurred_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * D'où vient — ou vers quoi va — ce mouvement. C'est la réponse à « de
     * quelle journée de caisse provient ce montant ? ».
     *
     * @return array<string, mixed>|null
     */
    private function source(): ?array
    {
        if ($this->source_type === null || $this->source_id === null) {
            return null;
        }

        $source = $this->resource->relationLoaded('source')
            ? $this->resource->source
            : null;

        $label = match (true) {
            $source instanceof WorkDay => 'Journée du '.$source->date->format('d/m/Y'),
            $source instanceof Expense => $source->label,
            default => null,
        };

        return [
            'type' => class_basename($this->source_type),
            'id' => (int) $this->source_id,
            'label' => $label,
            'date' => $source instanceof WorkDay ? $source->date->toDateString() : null,
        ];
    }

    private function typeLabel(): string
    {
        return match ($this->type) {
            'CASH_REGISTER_RESULT' => 'Résultat de caisse',
            'TRANSFER_TO_SUPER_ADMIN' => $this->direction === 'out'
                ? 'Envoyé au Super Admin'
                : 'Reçu d\'un Admin',
            'EXPENSE' => 'Dépense',
            'CASH_FUND' => 'Affecté au fond de caisse',
            'CASH_FUND_RETURN' => 'Fond de caisse repris',
            'ADJUSTMENT' => 'Ajustement',
            default => $this->type,
        };
    }
}
