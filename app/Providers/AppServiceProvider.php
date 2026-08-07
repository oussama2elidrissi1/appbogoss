<?php

namespace App\Providers;

use App\Repositories\Contracts\AppointmentRepositoryInterface;
use App\Repositories\Contracts\ClientRepositoryInterface;
use App\Repositories\Contracts\EmployeeRepositoryInterface;
use App\Repositories\Contracts\ExpenseRepositoryInterface;
use App\Repositories\Contracts\ProductRepositoryInterface;
use App\Repositories\Contracts\SaleRepositoryInterface;
use App\Repositories\Eloquent\AppointmentRepository;
use App\Repositories\Eloquent\ClientRepository;
use App\Repositories\Eloquent\EmployeeRepository;
use App\Repositories\Eloquent\ExpenseRepository;
use App\Repositories\Eloquent\ProductRepository;
use App\Repositories\Eloquent\SaleRepository;
use App\Services\LoyaltySettingsService;
use App\Services\Otp\LogOtpProvider;
use App\Services\Otp\OtpProviderInterface;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(ClientRepositoryInterface::class, ClientRepository::class);
        $this->app->bind(EmployeeRepositoryInterface::class, EmployeeRepository::class);
        $this->app->bind(ProductRepositoryInterface::class, ProductRepository::class);
        $this->app->bind(SaleRepositoryInterface::class, SaleRepository::class);
        $this->app->bind(ExpenseRepositoryInterface::class, ExpenseRepository::class);
        $this->app->bind(AppointmentRepositoryInterface::class, AppointmentRepository::class);

        // No real SMS/WhatsApp gateway is configured yet (Fidélité →
        // Paramètres → OTP, provider=log) — swap this binding for a real
        // provider class once one is, without touching OtpService or any
        // controller. LogOtpProvider is intentionally the only case here.
        $this->app->bind(OtpProviderInterface::class, function () {
            return match (app(LoyaltySettingsService::class)->get('otp_provider', 'log')) {
                default => new LogOtpProvider(),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
