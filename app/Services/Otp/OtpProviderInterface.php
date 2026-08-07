<?php

namespace App\Services\Otp;

/**
 * Pluggable OTP delivery — swap the bound implementation (see
 * AppServiceProvider) to move from the dev log provider to a real SMS/
 * WhatsApp gateway without touching OtpService or any controller.
 */
interface OtpProviderInterface
{
    /**
     * @return string a machine-readable channel name stored on the OTP row (e.g. 'log', 'sms', 'whatsapp')
     */
    public function send(string $phoneE164, string $code): string;
}
