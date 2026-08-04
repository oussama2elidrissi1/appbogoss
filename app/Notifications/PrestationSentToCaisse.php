<?php

namespace App\Notifications;

use App\Models\Prestation;
use Illuminate\Notifications\Notification;

class PrestationSentToCaisse extends Notification
{
    public function __construct(private readonly Prestation $prestation)
    {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'prestation_sent_to_caisse',
            'prestation_id' => $this->prestation->id,
            'reference' => $this->prestation->reference,
            'employee_name' => $this->prestation->employee?->name,
            'total' => (float) $this->prestation->total,
            'message' => sprintf(
                'Nouvelle prestation en attente de paiement – Employé : %s – Total : %s DH',
                $this->prestation->employee?->name ?? 'Employé',
                number_format((float) $this->prestation->total, 2),
            ),
        ];
    }
}
