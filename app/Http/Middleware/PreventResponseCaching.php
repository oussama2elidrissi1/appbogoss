<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Some shared-hosting stacks (LiteSpeed cache, CDNs, browser HTTP cache) will
 * cache GET responses by default, including /sanctum/csrf-cookie and session-
 * bound API responses. A cached CSRF cookie or session response served to a
 * different visitor causes permanent "CSRF token mismatch" / session errors.
 * This app is a fully authenticated dashboard — nothing it returns should
 * ever be cached — so every response is forced to bypass all caching layers.
 */
class PreventResponseCaching
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
