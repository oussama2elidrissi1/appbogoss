<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * One generic notification class for every loyalty/subscription event
 * (§22/§23), rather than ~12 near-identical subclasses — the event
 * identity lives in `type` + `data`, the per-event enabled/channels/
 * template configuration lives in LoyaltySettingsService, all read and
 * assembled by LoyaltyNotifier before this is dispatched. Keeps the
 * `data.type`/`data.message` contract the existing notification bell
 * already depends on (NotificationController, NotificationsBell.tsx).
 */
class LoyaltyNotification extends Notification
{
    use Queueable;

    /** @param  array<string, mixed>  $data */
    public function __construct(
        private readonly string $type,
        private readonly string $message,
        private readonly array $data = [],
        private readonly array $channels = ['database'],
    ) {
    }

    public function via(object $notifiable): array
    {
        $channels = ['database'];
        if (in_array('mail', $this->channels, true) && ! empty($notifiable->email ?? null)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    public function toArray(object $notifiable): array
    {
        return array_merge(['type' => $this->type, 'message' => $this->message], $this->data);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage())
            ->subject('BOGOSLAND — '.$this->message)
            ->greeting('Bonjour '.($notifiable->name ?? '').',')
            ->line($this->message);
    }
}
