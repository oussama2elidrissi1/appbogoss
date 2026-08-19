<?php

namespace App\Services;

use App\Models\SupportConversation;
use App\Models\User;
use App\Notifications\AppointmentNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * §24/§25 — notifications for the support chat. Reuses the generic
 * type/message/data notification contract (AppointmentNotification is
 * misnamed at this point — it's really the app's one generic
 * database-notification class — kept as-is to avoid a churny rename).
 */
class SupportNotifier
{
    public function newMessageFromPartner(SupportConversation $conversation): void
    {
        $this->send(
            User::role(['admin', 'super-admin'])->get(),
            'support_message_from_partner',
            sprintf('Nouveau message de %s dans le support.', $conversation->partner?->name ?? 'un partenaire'),
            $conversation,
        );
    }

    public function newMessageFromStaff(SupportConversation $conversation): void
    {
        $user = $conversation->partner?->user;
        if (! $user) {
            return;
        }
        $this->send($user, 'support_message_from_staff', 'BOGOSLAND a répondu à votre message.', $conversation);
    }

    private function send($notifiable, string $type, string $message, SupportConversation $conversation): void
    {
        try {
            Notification::send($notifiable, new AppointmentNotification($type, $message, [
                'conversation_id' => $conversation->id,
            ]));
        } catch (Throwable $e) {
            Log::warning('Support notification failed to send.', [
                'type' => $type,
                'conversation_id' => $conversation->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
