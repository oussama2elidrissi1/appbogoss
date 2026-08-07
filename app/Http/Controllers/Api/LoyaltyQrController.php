<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use App\Services\LoyaltySettingsService;
use Illuminate\Http\JsonResponse;

/**
 * Fidélité → QR Code (§1). The QR itself is rendered client-side (the
 * frontend already uses the `qrcode` npm package for receipt QR codes) —
 * this endpoint only manages the token embedded in the /join link and the
 * on/off + message settings, all stored via LoyaltySettingsService.
 */
class LoyaltyQrController extends Controller
{
    public function __construct(
        private readonly LoyaltySettingsService $settings,
        private readonly ActivityLogger $activityLogger,
    ) {
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => [
            'enabled' => (bool) $this->settings->get('loyalty_qr_registration_enabled', true),
            'message' => $this->settings->get('loyalty_qr_message'),
            'token' => $this->settings->ensureQrToken(),
            'join_path' => '/join',
        ]]);
    }

    public function regenerate(): JsonResponse
    {
        $token = $this->settings->regenerateQrToken();

        $this->activityLogger->log('loyalty.qr_token_regenerated');

        return response()->json(['data' => [
            'token' => $token,
        ]]);
    }
}
