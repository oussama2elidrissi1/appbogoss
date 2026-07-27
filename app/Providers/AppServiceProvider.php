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
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
