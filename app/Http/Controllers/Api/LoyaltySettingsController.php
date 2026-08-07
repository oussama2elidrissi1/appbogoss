<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use App\Services\LoyaltyNotifier;
use App\Services\LoyaltySettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Fidélité → Paramètres (§25). All values live in the existing AppSetting
 * key-value table (see LoyaltySettingsService) — no new settings table.
 */
class LoyaltySettingsController extends Controller
{
    public function __construct(
        private readonly LoyaltySettingsService $settings,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => array_merge(
            $this->settings->all(),
            ['notification_events' => LoyaltyNotifier::EVENTS],
        )]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'loyalty_enabled' => ['sometimes', 'boolean'],
            'loyalty_number_prefix' => ['sometimes', 'string', 'max:10'],
            'loyalty_timezone' => ['sometimes', 'string', 'timezone'],

            'loyalty_qr_registration_enabled' => ['sometimes', 'boolean'],
            'loyalty_qr_message' => ['sometimes', 'string', 'max:255'],
            'loyalty_qr_poster_language' => ['sometimes', Rule::in(['fr', 'ar', 'both'])],
            'loyalty_personal_qr_enabled' => ['sometimes', 'boolean'],

            'otp_provider' => ['sometimes', Rule::in(['log'])],
            'otp_ttl_seconds' => ['sometimes', 'integer', 'min:60', 'max:1800'],
            'otp_max_attempts' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'otp_resend_cooldown_seconds' => ['sometimes', 'integer', 'min:10', 'max:600'],
            'otp_max_sends_per_hour' => ['sometimes', 'integer', 'min:1', 'max:20'],

            'loyalty_reward_default_expiry_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
            'loyalty_reward_refund_behavior' => ['sometimes', Rule::in(['auto_reverse'])],

            'subscription_expiry_alert_days' => ['sometimes', 'integer', 'min:1', 'max:60'],
            'subscription_allow_suspension_default' => ['sometimes', 'boolean'],
            'subscription_allow_renewal_default' => ['sometimes', 'boolean'],

            'loyalty_notification_settings' => ['sometimes', 'array'],
        ]);

        $old = $this->settings->all();
        $this->settings->set($validated);

        $this->activityLogger->log('loyalty.settings_updated', null, $old, $validated);

        return response()->json(['data' => $this->settings->all()]);
    }
}
