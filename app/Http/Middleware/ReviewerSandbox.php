<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Le bac à sable du compte de validation Google Play.
 *
 * Enregistré dans le groupe `api` du Kernel : il voit TOUTES les requêtes API,
 * quel que soit le client (app mobile, SPA web, curl direct). Pour tout
 * utilisateur qui ne porte pas le rôle `google_reviewer`, il est transparent.
 *
 * Pour le reviewer, la règle est une LISTE BLANCHE, pas une liste noire :
 *
 *  - lecture (GET/HEAD) : libre — les policies et permissions existantes
 *    continuent de filtrer ce qu'il peut voir (rien d'admin : son rôle n'a
 *    aucune permission) ;
 *  - écritures : seules celles du parcours « composer une prestation de
 *    démonstration » passent, plus la déconnexion et le marquage des
 *    notifications. La seule suppression tolérée est le retrait d'une ligne
 *    de SA prestation en cours (partie normale de la composition — la
 *    PrestationPolicy vérifie déjà qu'il en est propriétaire) ;
 *  - TOUT le reste — y compris `send-to-caisse` et `confirm-payment`, qui
 *    feraient entrer une prestation de test dans la caisse réelle, y compris
 *    l'annulation et toute autre suppression, même de ses propres données —
 *    répond 403 ici, côté serveur.
 *
 * Comparaison sur l'URI de ROUTE (`prestations/{prestation}/items`), pas sur
 * le chemin brut : impossible de contourner par un encodage d'URL, et la
 * liste reste lisible en face de routes/api.php.
 */
class ReviewerSandbox
{
    public const ROLE = 'google_reviewer';

    private const MESSAGE = 'Compte de démonstration Google Play : cette action est désactivée.';

    /**
     * Écritures autorisées, sous la forme "MÉTHODE uri-de-route".
     *
     * @var list<string>
     */
    private const ALLOWED_WRITES = [
        'POST api/logout',
        'POST api/mobile/logout',
        'POST api/prestations',
        'POST api/prestations/{prestation}/items',
        'PATCH api/prestations/{prestation}/items/{item}',
        'DELETE api/prestations/{prestation}/items/{item}',
        'POST api/prestations/{prestation}/complete-services',
        'POST api/notifications/{id}/read',
        'POST api/notifications/read-all',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        // Le groupe `api` s'exécute avant `auth:sanctum` (middleware de
        // route) : on interroge explicitement le garde sanctum, qui résout
        // aussi bien le token Bearer mobile que la session SPA.
        $user = $request->user('sanctum');

        if (! $user instanceof User || ! $user->hasRole(self::ROLE)) {
            return $next($request);
        }

        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $signature = $request->method().' '.($request->route()?->uri() ?? $request->path());

        if (in_array($signature, self::ALLOWED_WRITES, true)) {
            return $next($request);
        }

        return response()->json(['message' => self::MESSAGE], 403);
    }
}
