<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Str;

/**
 * Flat key-value settings for the whole Fidélité & Abonnements module,
 * stored in the existing `app_settings` table (same mechanism as the
 * general salon settings in SettingsController) rather than a new table —
 * every key here is simply prefixed `loyalty_`/`otp_` to stay in the same
 * namespace without colliding with the general settings' keys.
 */
class LoyaltySettingsService
{
    public const DEFAULTS = [
        // Général
        'loyalty_enabled' => true,
        'loyalty_number_prefix' => 'FID',
        'loyalty_timezone' => 'Africa/Casablanca',

        // QR & inscription publique
        'loyalty_qr_registration_enabled' => true,
        'loyalty_qr_message' => 'Scannez pour rejoindre les avantages BOGOSLAND',
        'loyalty_qr_token' => null,
        'loyalty_personal_qr_enabled' => true,

        // OTP
        'otp_provider' => 'log',
        'otp_ttl_seconds' => 300,
        'otp_max_attempts' => 5,
        'otp_resend_cooldown_seconds' => 60,
        'otp_max_sends_per_hour' => 5,

        // Récompenses
        'loyalty_reward_default_expiry_days' => 30,
        'loyalty_reward_refund_behavior' => 'auto_reverse',

        // Abonnements
        'subscription_expiry_alert_days' => 7,
        'subscription_allow_suspension_default' => false,
        'subscription_allow_renewal_default' => true,

        // Notifications (per-event JSON blob — see NotificationSettings)
        'loyalty_notification_settings' => null,
    ];

    /** @return array<string, mixed> */
    public function all(): array
    {
        $stored = AppSetting::query()
            ->whereIn('key', array_keys(self::DEFAULTS))
            ->pluck('value', 'key')
            ->all();

        $merged = [];
        foreach (self::DEFAULTS as $key => $default) {
            $merged[$key] = array_key_exists($key, $stored) && $stored[$key] !== null
                ? $this->cast($key, $stored[$key])
                : $default;
        }

        return $merged;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $value = AppSetting::query()->where('key', $key)->value('value');

        if ($value === null) {
            return self::DEFAULTS[$key] ?? $default;
        }

        return $this->cast($key, $value);
    }

    /** @param  array<string, mixed>  $values */
    public function set(array $values): void
    {
        foreach ($values as $key => $value) {
            if (! array_key_exists($key, self::DEFAULTS)) {
                continue;
            }
            AppSetting::updateOrCreate(
                ['key' => $key],
                ['value' => is_bool($value) ? ($value ? '1' : '0') : (is_array($value) ? json_encode($value) : $value)],
            );
        }
    }

    public function ensureQrToken(): string
    {
        $token = $this->get('loyalty_qr_token');
        if (is_string($token) && $token !== '') {
            return $token;
        }

        $token = Str::random(40);
        $this->set(['loyalty_qr_token' => $token]);

        return $token;
    }

    public function regenerateQrToken(): string
    {
        $token = Str::random(40);
        $this->set(['loyalty_qr_token' => $token]);

        return $token;
    }

    private function cast(string $key, mixed $value): mixed
    {
        $default = self::DEFAULTS[$key] ?? null;

        if (is_bool($default)) {
            return in_array($value, [true, 1, '1', 'true'], true);
        }
        if (is_int($default)) {
            return (int) $value;
        }
        if ($key === 'loyalty_notification_settings' && is_string($value) && $value !== '') {
            return json_decode($value, true) ?? [];
        }

        return $value;
    }
}
