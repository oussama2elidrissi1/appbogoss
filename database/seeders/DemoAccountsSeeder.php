<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Service;
use App\Models\User;
use App\Services\PrestationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Demo accounts and sample data for the roles/prestations/commissions system:
 * a Super Admin, employee login accounts, a few commission rules, and sample
 * prestations across draft/pending/paid statuses. Idempotent — safe to re-run.
 *
 * IMPORTANT: these are demo credentials only. Change them before any
 * production deployment.
 */
class DemoAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::firstOrCreate(
            ['email' => 'super@bogosland.com'],
            [
                'name' => 'Super Admin BOGOSLAND',
                'password' => Hash::make('AjiBogos@2027@'),
                'role' => 'super-admin',
                'is_active' => true,
            ],
        );
        if (! $superAdmin->hasRole('super-admin')) {
            $superAdmin->assignRole('super-admin');
        }

        $employees = Employee::where('is_company', false)
            ->whereNull('user_id')
            ->orderBy('id')
            ->limit(3)
            ->get();

        $loginEmployees = collect();

        foreach ($employees as $index => $employee) {
            $slug = str($employee->name)->slug('.');
            $user = User::firstOrCreate(
                ['email' => "{$slug}@bogosland.com"],
                [
                    'name' => $employee->name,
                    'password' => Hash::make('password123'),
                    'role' => 'employee',
                    'is_active' => true,
                ],
            );
            if (! $user->hasRole('employee')) {
                $user->assignRole('employee');
            }
            if ($employee->user_id === null) {
                $employee->update(['user_id' => $user->id]);
            }

            $loginEmployees->push($employee->fresh());
        }

        $this->seedCommissionRules($loginEmployees);
        $this->seedSamplePrestations($loginEmployees, $superAdmin);

        $this->command?->info('Demo accounts seeded:');
        $this->command?->info('  Super Admin : super@bogosland.com / AjiBogos@2027@');
        foreach ($loginEmployees as $employee) {
            $slug = str($employee->name)->slug('.');
            $this->command?->info("  Employe     : {$slug}@bogosland.com / password123 ({$employee->name})");
        }
        $this->command?->warn('  -> Mots de passe de demonstration : a changer avant toute mise en production.');
    }

    protected function seedCommissionRules($employees): void
    {
        $services = Service::inRandomOrder()->limit(4)->get();
        if ($services->isEmpty() || $employees->isEmpty()) {
            return;
        }

        $configs = [
            ['type' => 'percentage', 'value' => 45],
            ['type' => 'fixed', 'value' => 20],
        ];

        foreach ($employees->take(2) as $index => $employee) {
            $service = $services[$index] ?? $services->first();
            $config = $configs[$index] ?? $configs[0];

            EmployeeServiceCommission::firstOrCreate(
                ['employee_id' => $employee->id, 'service_id' => $service->id],
                [
                    'type' => $config['type'],
                    'value' => $config['value'],
                    'starts_on' => now()->subDays(30)->toDateString(),
                    'ends_on' => null,
                    'is_active' => true,
                    'notes' => 'Regle de demonstration',
                ],
            );
        }
    }

    protected function seedSamplePrestations($employees, User $superAdmin): void
    {
        if ($employees->isEmpty()) {
            return;
        }

        $service = Service::inRandomOrder()->first();
        if ($service === null) {
            return;
        }

        $prestationService = app(PrestationService::class);
        $employee = $employees->first();
        $actor = $employee->user;

        if ($actor === null) {
            return;
        }

        try {
            // 1. A prestation still being built (in_progress).
            $prestationService->create(
                ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
                $employee,
                $actor,
            );

            // 2. A prestation sent to the caisse, awaiting payment confirmation.
            $pending = $prestationService->create(
                ['items' => [['service_id' => $service->id, 'quantity' => 1]]],
                $employee,
                $actor,
            );
            $pending = $prestationService->markServicesDone($pending, $actor);
            $prestationService->sendToCaisse($pending, $actor);

            // 3. A fully paid prestation, with commission already calculated.
            $paid = $prestationService->create(
                ['items' => [['service_id' => $service->id, 'quantity' => 2]]],
                $employee,
                $actor,
            );
            $paid = $prestationService->markServicesDone($paid, $actor);
            $paid = $prestationService->sendToCaisse($paid, $actor);
            $prestationService->confirmPayment($paid, ['payment_method' => 'especes'], $superAdmin);
        } catch (\Illuminate\Validation\ValidationException $e) {
            // No open work day in this environment — skip sample prestations silently.
            $this->command?->warn('Prestations de demonstration ignorees : '.$e->getMessage());
        }
    }
}
