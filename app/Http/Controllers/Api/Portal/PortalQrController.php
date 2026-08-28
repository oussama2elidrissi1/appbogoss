<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientQrToken;
use App\Services\LoyaltySettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Carte client du portail — le QR d'identification personnelle, côté client.
 *
 * Pourquoi cet ajout : le token existe déjà (ClientQrToken, §10) et le
 * personnel le résout via POST /api/qr/lookup, mais il n'était lisible que
 * par un compte staff (GET /api/clients/{client}/qr, permission
 * loyalty.redeem). Or c'est le client qui doit présenter son QR au salon —
 * sans cette route, l'application mobile n'aurait aucun moyen de l'afficher.
 *
 * Strictement en LECTURE. Trois choix délibérés :
 *
 *  - aucune création de token ici. `ClientQrToken::regenerate` reste une action
 *    du personnel : un client ne doit pas pouvoir faire tourner son identifiant
 *    lui-même (cela invaliderait la carte imprimée/enregistrée côté salon).
 *    Quand aucun token n'existe, on renvoie `null` et l'application invite à
 *    se rapprocher du salon ;
 *  - le token est celui du client authentifié, jamais un identifiant passé en
 *    paramètre : il n'y a rien à falsifier ;
 *  - le drapeau `loyalty_personal_qr_enabled` est respecté à l'identique de
 *    ClientQrController, pour que désactiver la fonctionnalité côté réglages
 *    l'éteigne aussi sur mobile.
 *
 * Le token seul n'ouvre aucun droit : `qr/lookup` exige `loyalty.redeem` et ne
 * renvoie que l'identité de ce même client.
 */
class PortalQrController extends Controller
{
    public function __construct(private readonly LoyaltySettingsService $settings)
    {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var Client $client */
        $client = $request->user();

        $enabled = (bool) $this->settings->get('loyalty_personal_qr_enabled', true);

        $token = $enabled
            ? ClientQrToken::where('client_id', $client->id)
                ->whereNull('revoked_at')
                ->value('token')
            : null;

        return response()->json(['data' => [
            'enabled' => $enabled,
            'token' => $token,
            'loyalty_number' => $client->loyaltyAccount?->loyalty_number,
            'name' => $client->name,
        ]]);
    }
}
