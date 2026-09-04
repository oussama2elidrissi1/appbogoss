<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to your application's "home" route.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/home';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        // Coarse, IP-based defense in depth for the public OTP endpoints —
        // the real per-phone-number cooldown/hourly-cap logic lives in
        // OtpService, keyed by phone rather than IP.
        RateLimiter::for('otp', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Mobile credential endpoints. Unlike the web /api/login — which sits
        // behind a browser, a CSRF token and a stateful origin — these accept
        // raw credentials from anywhere, so they get their own IP budget on
        // top of the per-account lockouts enforced in the controllers.
        RateLimiter::for('mobile-login', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Vitrine publique : lecture confortable, ecriture parcimonieuse.
        // La creation de reservation porte en plus ses propres gardes metier
        // (telephone marocain valide, plafond de reservations a venir par
        // client) dans PublicBookingService.
        RateLimiter::for('public-read', function (Request $request) {
            return Limit::perMinute(60)->by($request->ip());
        });

        RateLimiter::for('public-booking', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        $this->routes(function () {
            Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }
}
