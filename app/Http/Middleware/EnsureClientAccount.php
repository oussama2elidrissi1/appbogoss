<?php

namespace App\Http\Middleware;

use App\Models\Client;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Asserts that the account resolved by the preceding `auth:` middleware is
 * really a Client, and aborts 403 otherwise.
 *
 * This is not belt-and-braces — it closes a concrete hole. Laravel\Sanctum\Guard
 * opens with:
 *
 *     foreach (Arr::wrap(config('sanctum.guard', 'web')) as $guard) { ... }
 *
 * which is read from the GLOBAL sanctum config (['web'] here) by every sanctum
 * guard instance alike, including `client-api`, and is evaluated before the
 * bearer token is even looked at. A browser holding a staff `web` session
 * therefore satisfies `auth:client-api` and would be handed to the portal
 * controllers as if it were the logged-in customer — PortalClientResource would
 * then read `loyalty_number`/`points_balance` off a User. The provider pinning
 * in config/auth.php does not help here: it only guards the token branch.
 *
 * Applied on every route reachable through `client-api`.
 */
class EnsureClientAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() instanceof Client) {
            abort(403, 'Ce compte n\'est pas un compte client.');
        }

        return $next($request);
    }
}
