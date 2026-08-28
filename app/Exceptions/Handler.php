<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * The list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    /**
     * Une requete /api/* non authentifiee doit repondre 401, jamais 302.
     *
     * App\Http\Middleware\Authenticate::redirectTo() renvoie deja null pour
     * `api/*`, mais le handler parent retombe sur `route('login')` quand
     * redirectTo() est null : l'intention etait donc annulee, et un client a
     * jeton recevait une redirection vers la page de connexion. Un navigateur
     * s'en accommode ; un client mobile, non — il suivait le 302 et recevait le
     * HTML du SPA avec un statut 200, la ou il attendait un PDF.
     *
     * Le SPA React n'est pas concerne : axios envoie deja Accept:
     * application/json et recevait donc deja un 401.
     */
    protected function unauthenticated($request, AuthenticationException $exception): Response
    {
        if ($request->expectsJson() || $request->is('api/*')) {
            return new JsonResponse(['message' => $exception->getMessage()], 401);
        }

        return parent::unauthenticated($request, $exception);
    }
}
