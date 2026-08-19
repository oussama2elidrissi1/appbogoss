<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Http\Resources\PartnerDetailResource;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * "Mon profil" (§15/§16) — the partner's own self-service identity,
 * business/branding and payment-info screen. Distinct from the admin
 * PartnerController, which can touch ANY partner; every write here is
 * always scoped to the authenticated account's own Partner record.
 */
class PartnerProfileController extends Controller
{
    use RequiresActivePartner;

    public function show(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request)->load('user');

        return response()->json(['data' => new PartnerDetailResource($partner)]);
    }

    public function update(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);

        $validated = $request->validate([
            'contact_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'trade_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'ice' => ['sometimes', 'nullable', 'string', 'max:50'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'country' => ['sometimes', 'nullable', 'string', 'max:120'],
            'payment_holder_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'payment_bank_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'payment_iban' => ['sometimes', 'nullable', 'string', 'max:64'],
            'payment_method_preference' => ['sometimes', 'nullable', 'string', 'max:50'],
            'login_email' => [
                'sometimes', 'required', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($partner->user_id),
            ],
        ]);

        $partner->update(collect($validated)->except('login_email')->all());

        if (! empty($validated['login_email']) && $partner->user) {
            $partner->user->update(['email' => $validated['login_email']]);
        }

        return response()->json(['data' => new PartnerDetailResource($partner->refresh()->load('user'))]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        abort_unless($partner->user !== null, 422, 'Aucun compte de connexion pour ce partenaire.');

        $validated = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $partner->user->update(['password' => Hash::make($validated['password'])]);

        return response()->json(['message' => 'Mot de passe modifié avec succès.']);
    }

    public function updateLogo(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $request->validate([
            'logo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        if (is_string($partner->logo_url) && str_starts_with($partner->logo_url, '/storage/')) {
            Storage::disk('public')->delete(substr($partner->logo_url, 9));
        }

        $partner->update([
            'logo_url' => Storage::disk('public')->url($request->file('logo')->store('partners', 'public')),
        ]);

        return response()->json(['data' => new PartnerDetailResource($partner->refresh()->load('user'))]);
    }

    public function destroyLogo(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);

        if (is_string($partner->logo_url) && str_starts_with($partner->logo_url, '/storage/')) {
            Storage::disk('public')->delete(substr($partner->logo_url, 9));
        }
        $partner->update(['logo_url' => null]);

        return response()->json(['data' => new PartnerDetailResource($partner->refresh()->load('user'))]);
    }
}
