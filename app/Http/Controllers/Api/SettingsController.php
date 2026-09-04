<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SettingsController extends Controller
{
    private const DEFAULTS = [
        // Reservation en ligne (vitrine mobile publique) - memes cles que
        // PublicBookingService::BOOKING_DEFAULTS.
        'booking_open_time' => '09:00',
        'booking_close_time' => '21:00',
        'booking_slot_minutes' => '30',
        'booking_lead_minutes' => '60',
        'booking_horizon_days' => '30',
        'booking_timezone' => 'Africa/Casablanca',
        'salon_name' => 'BOGOSLAND',
        'salon_phone' => '',
        'salon_email' => '',
        'salon_address' => '',
        'currency' => 'MAD',
        'receipt_footer' => 'Merci pour votre visite',
        'logo_url' => null,
    ];

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->settings()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'salon_name' => ['sometimes', 'required', 'string', 'max:120'],
            'salon_phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'salon_email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'salon_address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'currency' => ['sometimes', 'required', 'string', 'max:8'],
            'receipt_footer' => ['sometimes', 'nullable', 'string', 'max:255'],
            'booking_open_time' => ['sometimes', 'required', 'date_format:H:i'],
            'booking_close_time' => ['sometimes', 'required', 'date_format:H:i'],
            'booking_slot_minutes' => ['sometimes', 'required', 'integer', 'min:5', 'max:240'],
            'booking_lead_minutes' => ['sometimes', 'required', 'integer', 'min:0', 'max:1440'],
            'booking_horizon_days' => ['sometimes', 'required', 'integer', 'min:1', 'max:365'],
            'booking_timezone' => ['sometimes', 'required', 'timezone'],
            'logo' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        if ($request->hasFile('logo')) {
            $oldLogo = $this->settings()['logo_url'];
            if (is_string($oldLogo) && str_starts_with($oldLogo, '/storage/')) {
                Storage::disk('public')->delete(substr($oldLogo, 9));
            }
            $data['logo_url'] = Storage::disk('public')->url($request->file('logo')->store('branding', 'public'));
        }
        unset($data['logo']);

        foreach ($data as $key => $value) {
            AppSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json(['data' => $this->settings()]);
    }

    public function removeLogo(): JsonResponse
    {
        $logo = $this->settings()['logo_url'];
        if (is_string($logo) && str_starts_with($logo, '/storage/')) {
            Storage::disk('public')->delete(substr($logo, 9));
        }
        AppSetting::updateOrCreate(['key' => 'logo_url'], ['value' => null]);

        return response()->json(['data' => $this->settings()]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
        ]);
        $user->update($data);

        return response()->json(new UserResource($user->refresh()));
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);
        $request->user()->update(['password' => Hash::make($data['password'])]);

        return response()->json(['message' => 'Mot de passe modifie avec succes.']);
    }

    /** @return array<string, string|null> */
    private function settings(): array
    {
        return array_merge(self::DEFAULTS, AppSetting::query()->pluck('value', 'key')->all());
    }
}
