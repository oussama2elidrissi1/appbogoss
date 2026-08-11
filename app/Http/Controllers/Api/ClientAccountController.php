<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\Prestation;
use App\Models\Sale;
use App\Services\ActivityLogger;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The 360° client account view (fiche client) plus staff-side management of
 * the customer's portal access (phone + password on the `client` guard).
 */
class ClientAccountController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function overview(Client $client): JsonResponse
    {
        // Soft-deleted sales are excluded automatically — a refunded/voided
        // ticket must not inflate the client's lifetime spend.
        $salesQuery = Sale::where('client_id', $client->id);
        $totalSpent = (float) (clone $salesQuery)->sum('total');
        $salesCount = (clone $salesQuery)->count();

        $recentSales = Sale::where('client_id', $client->id)
            ->with('items')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->map(fn (Sale $sale) => [
                'id' => $sale->id,
                'date' => $sale->created_at?->toIso8601String(),
                'label' => $sale->items->pluck('label')->filter()->take(3)->implode(' · ') ?: 'Vente',
                'total' => (float) $sale->total,
                'payment_method' => $sale->payment_method,
            ]);

        $recentAppointments = Appointment::where(function ($query) use ($client): void {
            $query->where('client_id', $client->id)
                ->orWhereJsonContains('client_ids', $client->id);
        })
            ->with('service')
            ->orderByDesc('starts_at')
            ->limit(10)
            ->get()
            ->map(fn (Appointment $appointment) => [
                'id' => $appointment->id,
                'starts_at' => $appointment->starts_at?->toIso8601String(),
                'status' => $appointment->status,
                'services' => collect($appointment->reservation_items ?: [])
                    ->pluck('service_id')
                    ->count() ?: 1,
                'service_name' => $appointment->service?->name,
            ]);

        $activeSubscriptions = ClientSubscription::where('client_id', $client->id)
            ->where('status', ClientSubscription::STATUS_ACTIVE)
            ->count();

        $prestationsCount = Prestation::where('client_id', $client->id)
            ->where('status', Prestation::STATUS_PAID)
            ->count();

        return response()->json(['data' => [
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'email' => $client->email,
                'phone' => $client->phone,
                'birth_date' => $client->birth_date?->toDateString(),
                'gender' => $client->gender,
                'avatar_color' => $client->avatar_color,
                'notes' => $client->notes,
                'loyalty_points' => (int) $client->loyalty_points,
                'last_visit_at' => $client->last_visit_at?->toIso8601String(),
                'created_at' => $client->created_at?->toIso8601String(),
            ],
            'portal' => [
                'has_password' => $client->password !== null,
                'phone_e164' => $client->phone_e164,
                'phone_verified_at' => $client->phone_verified_at?->toIso8601String(),
                'registered_at' => $client->registered_at?->toIso8601String(),
                'terms_consent_at' => $client->consent_terms_at?->toIso8601String(),
                'marketing_consent' => $client->consent_marketing_at !== null,
            ],
            'stats' => [
                'sales_count' => $salesCount,
                'total_spent' => $totalSpent,
                'prestations_count' => $prestationsCount,
                'appointments_count' => $client->appointments()->count(),
                'active_subscriptions' => $activeSubscriptions,
            ],
            'recent_sales' => $recentSales,
            'recent_appointments' => $recentAppointments,
        ]]);
    }

    /**
     * Creates or resets the customer's portal access. The portal identifier
     * is the phone number — a client without a usable phone can't get one.
     * The password is returned exactly once, to be handed to the customer.
     */
    public function setPortalPassword(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        if (! filled($client->phone) && ! filled($client->phone_e164)) {
            throw ValidationException::withMessages([
                'phone' => 'Ajoutez d’abord un numéro de téléphone : c’est l’identifiant de connexion du client.',
            ]);
        }

        if ($client->phone_e164 === null) {
            $phoneE164 = PhoneNumberNormalizer::toE164((string) $client->phone);
            if ($phoneE164 === null) {
                throw ValidationException::withMessages([
                    'phone' => 'Le numéro de téléphone du client est invalide — corrigez-le avant de créer l’accès.',
                ]);
            }

            $conflict = Client::where('phone_e164', $phoneE164)->where('id', '!=', $client->id)->exists();
            if ($conflict) {
                throw ValidationException::withMessages([
                    'phone' => 'Un autre client utilise déjà ce numéro de téléphone.',
                ]);
            }

            $client->phone_e164 = $phoneE164;
        }

        $newPassword = $validated['password'] ?? Str::password(10);
        $wasRegistered = $client->registered_at !== null;

        $client->forceFill([
            // Hashed by the model's 'password' => 'hashed' cast.
            'password' => $newPassword,
            'registered_at' => $client->registered_at ?? now(),
            'phone_verified_at' => $client->phone_verified_at ?? now(),
        ])->save();

        $this->activityLogger->log(
            $wasRegistered ? 'client.portal_password_reset' : 'client.portal_access_created',
            $client,
        );

        return response()->json(['data' => [
            'phone' => $client->phone,
            'temporary_password' => $newPassword,
        ]]);
    }
}
