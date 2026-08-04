<?php

namespace App\Notifications;

use App\Models\Prestation;
use Illuminate\Notifications\Notification;

class PrestationPaid extends Notification
{
    public function __construct(private readonly Prestation $prestation, private readonly float $commissionAmount)
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
            'type' => 'prestation_paid',
            'prestation_id' => $this->prestation->id,
            'reference' => $this->prestation->reference,
            'commission_amount' => $this->commissionAmount,
            'message' => sprintf(
                'La prestation N°%s a été payée. Commission générée : %s DH.',
                $this->prestation->reference,
                number_format($this->commissionAmount, 2),
            ),
        ];
    }
}
