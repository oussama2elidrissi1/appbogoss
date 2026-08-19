<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * One generic notification class for every partner-booking event (§34),
 * mirroring the existing LoyaltyNotification/PrestationPaid `type` +
 * `message` + `data` contract the notification bell already reads.
 */
class AppointmentNotification extends Notification
{
    /** @param  array<string, mixed>  $data */
    public function __construct(
        private readonly string $type,
        private readonly string $message,
        private readonly array $data = [],
    ) {
    }

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return array_merge(['type' => $this->type, 'message' => $this->message], $this->data);
    }
}
