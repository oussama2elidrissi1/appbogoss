<?php

namespace App\Services\Otp;

use Illuminate\Support\Facades\Log;

/**
 * Development/test provider — never sends a real SMS. Writes the code to
 * the Laravel log so a developer/tester can read it, instead of blocking
 * the whole OTP flow on having a configured SMS/WhatsApp gateway (none is
 * configured yet — see loyalty settings "OTP" section, provider=log).
 */
class LogOtpProvider implements OtpProviderInterface
{
    public function send(string $phoneE164, string $code): string
    {
        Log::info("[OTP:dev] Code de connexion BOGOSLAND pour {$phoneE164} : {$code}");

        return 'log';
    }
}
