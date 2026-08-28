<?php

namespace App\Providers;

use App\Models\Client;
use App\Models\Prestation;
use App\Models\User;
use App\Policies\ClientPolicy;
use App\Policies\PrestationPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;
use Laravel\Sanctum\Sanctum;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The model to policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        Prestation::class => PrestationPolicy::class,
        Client::class => ClientPolicy::class,
    ];

    /**
     * Register any authentication / authorization services.
     */
    public function boot(): void
    {
        // Super Admin bypasses every permission/policy check.
        Gate::before(fn ($user) => $user->hasRole('super-admin') ? true : null);

        // `is_active` is checked at login time only, which is enough for the
        // web SPA (deactivating an account is paired with the session dying
        // within SESSION_LIFETIME). Personal access tokens have no such
        // ceiling — sanctum.expiration is null, so they live until revoked.
        // Without this, deactivating a staff account would leave its phone
        // fully authenticated forever. Runs on the token branch only, so the
        // cookie-authenticated web app is untouched.
        Sanctum::authenticateAccessTokensUsing(function ($accessToken, bool $isValid): bool {
            if (! $isValid) {
                return false;
            }

            $tokenable = $accessToken->tokenable;

            return $tokenable instanceof User ? (bool) $tokenable->is_active : true;
        });
    }
}
