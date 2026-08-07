<?php

namespace App\Services\Otp;

use App\Models\Client;
use App\Models\CustomerOtpCode;
use App\Services\LoyaltySettingsService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Phone + OTP is the customer portal's only authentication method — no
 * password ever exists for a Client. Every step here is driver-agnostic
 * (no lockForUpdate reliance) since a Client login only ever touches rows
 * scoped to a single phone number, so ordinary row updates are enough.
 */
class OtpService
{
    public function __construct(
        private readonly OtpProviderInterface $provider,
        private readonly LoyaltySettingsService $settings,
    ) {
    }

    /**
     * @return array{expires_at: \Carbon\Carbon, dev_code: string|null}
     */
    public function requestCode(string $phoneE164, string $ip): array
    {
        $cooldownKey = "otp-resend:{$phoneE164}";
        $cooldown = (int) $this->settings->get('otp_resend_cooldown_seconds', 60);
        if (RateLimiter::tooManyAttempts($cooldownKey, 1)) {
            throw ValidationException::withMessages([
                'phone' => 'Veuillez patienter avant de redemander un code.',
            ]);
        }

        $hourlyKey = "otp-hourly:{$phoneE164}";
        $maxPerHour = (int) $this->settings->get('otp_max_sends_per_hour', 5);
        if (RateLimiter::tooManyAttempts($hourlyKey, $maxPerHour)) {
            throw ValidationException::withMessages([
                'phone' => 'Trop de tentatives. Réessayez plus tard.',
            ]);
        }

        // Invalidate any still-pending code for this phone so only the
        // newest one is ever verifiable.
        CustomerOtpCode::where('phone_e164', $phoneE164)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $code = (string) random_int(100000, 999999);
        $ttlSeconds = (int) $this->settings->get('otp_ttl_seconds', 300);
        $maxAttempts = (int) $this->settings->get('otp_max_attempts', 5);

        $client = \App\Models\Client::where('phone_e164', $phoneE164)->first();

        $otp = CustomerOtpCode::create([
            'phone_e164' => $phoneE164,
            'client_id' => $client?->id,
            'code_hash' => Hash::make($code),
            'purpose' => CustomerOtpCode::PURPOSE_LOGIN,
            'max_attempts' => $maxAttempts,
            'expires_at' => now()->addSeconds($ttlSeconds),
            'requested_ip' => $ip,
        ]);

        $channel = $this->provider->send($phoneE164, $code);
        $otp->update(['channel' => $channel]);

        RateLimiter::hit($cooldownKey, $cooldown);
        RateLimiter::hit($hourlyKey, 3600);

        return [
            'expires_at' => $otp->expires_at,
            // Only ever populated by the dev/log provider — a real SMS/WhatsApp
            // provider returns a channel name that never triggers this.
            'dev_code' => $channel === 'log' ? $code : null,
        ];
    }

    public function verifyCode(string $phoneE164, string $code): CustomerOtpCode
    {
        $otp = CustomerOtpCode::where('phone_e164', $phoneE164)
            ->whereNull('consumed_at')
            ->orderByDesc('id')
            ->first();

        if ($otp === null || $otp->expires_at->isPast()) {
            throw ValidationException::withMessages([
                'code' => 'Code invalide ou expiré. Demandez un nouveau code.',
            ]);
        }

        if ($otp->attempts >= $otp->max_attempts) {
            throw ValidationException::withMessages([
                'code' => 'Trop de tentatives. Demandez un nouveau code.',
            ]);
        }

        if (! Hash::check($code, $otp->code_hash)) {
            $otp->increment('attempts');
            throw ValidationException::withMessages([
                'code' => 'Code incorrect.',
            ]);
        }

        $otp->update(['consumed_at' => now()]);

        return $otp;
    }

    /**
     * §33 sweep — OTP codes carry a hashed code and a phone number, not
     * anything sensitive on their own, but there is no reason to keep them
     * once they can no longer be verified. A 24h grace window past
     * expiry/consumption is kept for support/debugging, not indefinitely.
     */
    public function pruneExpired(): int
    {
        $cutoff = now()->subDay();

        return CustomerOtpCode::where(function ($query) use ($cutoff) {
            $query->where('consumed_at', '<', $cutoff)
                ->orWhere('expires_at', '<', $cutoff);
        })->delete();
    }
}
