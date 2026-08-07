<?php

namespace App\Services;

/**
 * Normalizes Moroccan phone numbers to E.164 (+212XXXXXXXXX) so
 * 0612345678 / +212612345678 / 212612345678 / with spaces or dashes all
 * resolve to the same identifier — the phone number is the customer
 * portal's login key, so this is what prevents duplicate accounts.
 */
class PhoneNumberNormalizer
{
    public static function toE164(string $raw): ?string
    {
        $digits = preg_replace('/[^\d+]/', '', trim($raw)) ?? '';
        $digits = ltrim($digits, '+');

        if (str_starts_with($digits, '212')) {
            $national = substr($digits, 3);
        } elseif (str_starts_with($digits, '0')) {
            $national = substr($digits, 1);
        } else {
            $national = $digits;
        }

        // Moroccan mobile/landline national numbers are 9 digits, starting
        // with 5, 6, or 7.
        if (! preg_match('/^[567]\d{8}$/', $national)) {
            return null;
        }

        return '+212'.$national;
    }
}
