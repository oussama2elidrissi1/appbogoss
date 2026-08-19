<?php

namespace App\Providers;

use App\Models\Client;
use App\Models\Prestation;
use App\Policies\ClientPolicy;
use App\Policies\PrestationPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

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
    }
}
