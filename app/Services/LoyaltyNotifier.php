<?php

namespace App\Services;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyReward;
use App\Models\User;
use App\Notifications\LoyaltyNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Renders and sends every loyalty/subscription notification event (§22).
 * Each event has a default French template; Fidélité → Paramètres →
 * Notifications lets Super Admin override enabled/channels/template per
 * event without touching code, stored in the loyalty_notification_settings
 * JSON blob (see LoyaltySettingsService).
 */
class LoyaltyNotifier
{
    public const EVENTS = [
        'welcome' => 'Bienvenue',
        'phone_verified' => 'Téléphone vérifié',
        'reward_generated' => 'Récompense gagnée',
        'reward_expiring_soon' => 'Récompense bientôt expirée',
        'reward_used' => 'Récompense utilisée',
        'subscription_activated' => 'Abonnement activé',
        'subscription_used' => 'Abonnement utilisé',
        'subscription_expiring_soon' => 'Abonnement bientôt expiré',
        'subscription_expired' => 'Abonnement expiré',
        'renewal_suggested' => 'Renouvellement conseillé',
        'birthday_offer' => 'Offre anniversaire',
    ];

    private const DEFAULT_TEMPLATES = [
        'welcome' => 'Bonjour {{first_name}}, bienvenue dans le programme de fidélité BOGOSLAND !',
        'phone_verified' => 'Votre numéro de téléphone a été vérifié avec succès.',
        'reward_generated' => 'Bonjour {{first_name}}, vous venez de gagner : {{reward_name}}. Valable jusqu’au {{expires_at}}.',
        'reward_expiring_soon' => 'Votre récompense {{reward_name}} expire le {{expires_at}} — n’oubliez pas de l’utiliser.',
        'reward_used' => 'Votre récompense {{reward_name}} a été utilisée. Merci de votre visite !',
        'subscription_activated' => 'Votre abonnement {{plan_name}} est actif jusqu’au {{ends_at}}.',
        'subscription_used' => 'Une utilisation de votre abonnement {{plan_name}} a été enregistrée.',
        'subscription_expiring_soon' => 'Votre abonnement {{plan_name}} expire le {{ends_at}}.',
        'subscription_expired' => 'Votre abonnement {{plan_name}} est arrivé à expiration.',
        'renewal_suggested' => 'Envie de continuer ? Renouvelez votre abonnement {{plan_name}} dès maintenant.',
        'birthday_offer' => 'Joyeux anniversaire {{first_name}} ! Une offre spéciale vous attend chez BOGOSLAND.',
    ];

    public function __construct(private readonly LoyaltySettingsService $settings)
    {
    }

    /** @param  array<string, string>  $vars */
    public function notifyClient(Client $client, string $event, array $vars = []): void
    {
        $config = $this->eventConfig($event);
        if (! $config['enabled']) {
            return;
        }

        $message = $this->render($config['template'], $vars);
        $this->send($client, $event, new LoyaltyNotification($event, $message, $vars, $config['channels']));
    }

    public function notifyStaff(string $event, string $message, array $data = []): void
    {
        $admins = User::role(['admin', 'super-admin'])->get();
        if ($admins->isEmpty()) {
            return;
        }
        $this->send($admins, $event, new LoyaltyNotification($event, $message, $data, ['database']));
    }

    /**
     * Several call sites (reward/subscription confirmation) run inside a
     * DB::transaction() alongside the payment itself. A channel failure
     * (e.g. 'mail' enabled but SMTP down) must never roll back an already-
     * confirmed payment, so failures here are logged, not thrown.
     */
    private function send($notifiable, string $event, LoyaltyNotification $notification): void
    {
        try {
            Notification::send($notifiable, $notification);
        } catch (Throwable $e) {
            Log::warning('Loyalty notification failed to send.', [
                'event' => $event,
                'exception' => $e->getMessage(),
            ]);
        }
    }

    /** @return array{enabled: bool, channels: array<int, string>, template: string} */
    private function eventConfig(string $event): array
    {
        $stored = $this->settings->get('loyalty_notification_settings', []);
        $eventStored = is_array($stored) ? ($stored[$event] ?? []) : [];

        return [
            'enabled' => $eventStored['enabled'] ?? true,
            'channels' => $eventStored['channels'] ?? ['database'],
            'template' => $eventStored['template'] ?? (self::DEFAULT_TEMPLATES[$event] ?? ''),
        ];
    }

    /** @param  array<string, string>  $vars */
    private function render(string $template, array $vars): string
    {
        $replacements = [];
        foreach ($vars as $key => $value) {
            $replacements['{{'.$key.'}}'] = $value;
        }

        return strtr($template, $replacements);
    }
}
