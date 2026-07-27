<?php

namespace Database\Seeders;

use App\Models\Advance;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\WorkDayService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $admin = User::create([
            'name' => 'Admin BOGOSLAND',
            'email' => 'admin@bogosland.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
        ]);

        $employeeColors = ['#C8A24C', '#4C7CC8', '#2E7D5B', '#B8860B', '#1B2A4A', '#8C6BC8'];
        $employeeNames = [
            ['name' => 'Sofia Martins', 'role' => 'coiffeuse'],
            ['name' => 'Karim Belkacem', 'role' => 'coiffeur'],
            ['name' => 'Julien Fabre', 'role' => 'barbier'],
            ['name' => 'Amelie Rousseau', 'role' => 'estheticienne'],
            ['name' => 'Nadia Cherif', 'role' => 'coiffeuse'],
            ['name' => 'Marc Lefevre', 'role' => 'manager'],
        ];

        $employees = collect($employeeNames)->map(function (array $data, int $index) use ($employeeColors) {
            return Employee::factory()->create([
                'name' => $data['name'],
                'role' => $data['role'],
                'avatar_color' => $employeeColors[$index % count($employeeColors)],
                'is_active' => true,
            ]);
        });

        // A few employees get a default commission rate pre-filled for convenience.
        $employees->take(3)->each(function (Employee $employee) {
            $employee->update(['default_commission_rate' => 40.00]);
        });

        $serviceDefinitions = [
            ['name' => 'Coupe Homme', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 25],
            ['name' => 'Coupe Femme', 'category' => 'coiffure', 'duration_minutes' => 45, 'price' => 45],
            ['name' => 'Coloration', 'category' => 'coiffure', 'duration_minutes' => 90, 'price' => 80],
            ['name' => 'Balayage', 'category' => 'coiffure', 'duration_minutes' => 120, 'price' => 120],
            ['name' => 'Brushing', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 30],
            ['name' => 'Taille de Barbe', 'category' => 'barbe', 'duration_minutes' => 20, 'price' => 18],
            ['name' => 'Rasage Traditionnel', 'category' => 'barbe', 'duration_minutes' => 30, 'price' => 28],
            ['name' => 'Soin Visage', 'category' => 'soin', 'duration_minutes' => 45, 'price' => 55],
            ['name' => 'Manucure', 'category' => 'esthetique', 'duration_minutes' => 40, 'price' => 35],
            ['name' => 'Epilation Sourcils', 'category' => 'esthetique', 'duration_minutes' => 15, 'price' => 15],
        ];

        $services = collect($serviceDefinitions)->map(fn (array $data) => Service::factory()->create($data));

        $clients = Client::factory()->count(40)->create();

        $products = Product::factory()->count(25)->create();

        // Force at least 5 products into a visible low-stock state.
        $products->take(5)->each(function (Product $product) {
            $product->update([
                'stock_quantity' => random_int(0, 4),
                'low_stock_threshold' => random_int(8, 15),
            ]);
        });

        // Appointments: ~120 spread across last 30 days and next 14 days.
        $statuses = ['confirmed', 'completed', 'cancelled', 'pending'];

        for ($i = 0; $i < 120; $i++) {
            $service = $services->random();
            $startsAt = fake()->dateTimeBetween('-30 days', '+14 days');
            $endsAt = (clone $startsAt)->modify('+'.$service->duration_minutes.' minutes');

            $status = $startsAt < now()
                ? fake()->randomElement(['completed', 'cancelled', 'confirmed'])
                : fake()->randomElement(['confirmed', 'pending']);

            Appointment::create([
                'client_id' => $clients->random()->id,
                'employee_id' => $employees->random()->id,
                'service_id' => $service->id,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'status' => $status,
                'notes' => fake()->optional(0.2)->sentence(),
            ]);
        }

        // Sales: ~80 spread over the last 30 days, each with 1-3 items.
        for ($i = 0; $i < 80; $i++) {
            $createdAt = fake()->dateTimeBetween('-30 days', 'now');

            $sale = Sale::create([
                'client_id' => fake()->boolean(85) ? $clients->random()->id : null,
                'employee_id' => $employees->random()->id,
                'total' => 0,
                'payment_method' => fake()->randomElement(['carte', 'especes', 'cheque']),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            $itemCount = random_int(1, 3);
            $total = 0;

            for ($j = 0; $j < $itemCount; $j++) {
                $useProduct = fake()->boolean(65);
                $item = $useProduct ? $products->random() : $services->random();
                $quantity = $useProduct ? random_int(1, 3) : 1;
                $unitPrice = (float) $item->price;

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'itemable_type' => $useProduct ? Product::class : Service::class,
                    'itemable_id' => $item->id,
                    'label' => $item->name,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);

                $total += $quantity * $unitPrice;
            }

            $sale->update(['total' => $total]);
        }

        // Expenses: ~30 spread over the last 90 days.
        for ($i = 0; $i < 30; $i++) {
            Expense::factory()->create([
                'spent_on' => fake()->dateTimeBetween('-90 days', 'now')->format('Y-m-d'),
            ]);
        }

        // "Exploitation Quotidienne": one closed work day (yesterday) and one open work day (today).
        $this->seedWorkDays($admin, $employees, $clients);

        $this->command?->info('Demo data seeded. Admin login: admin@bogosland.com / password (user #'.$admin->id.').');
    }

    /**
     * Seed one closed work day (yesterday) and one open work day (today),
     * representing the new "Exploitation Quotidienne" module.
     */
    protected function seedWorkDays(User $admin, $employees, $clients): void
    {
        $prestations = [
            ['category' => 'coiffure', 'label' => 'Coupe + Barbe', 'price' => 50],
            ['category' => 'coiffure', 'label' => 'Coupe Homme', 'price' => 30],
            ['category' => 'hammam', 'label' => 'Hammam Classique', 'price' => 150],
            ['category' => 'hammam', 'label' => 'Hammam Royal', 'price' => 250],
            ['category' => 'massage', 'label' => 'Massage Relaxant', 'price' => 250],
            ['category' => 'boisson', 'label' => 'Thé à la menthe', 'price' => 15],
            ['category' => 'boisson', 'label' => 'Café', 'price' => 12],
            ['category' => 'vitrine', 'label' => 'Huile d\'argan', 'price' => 90],
            ['category' => 'vitrine', 'label' => 'Savon noir', 'price' => 45],
        ];

        // 1. Closed work day for yesterday.
        $yesterday = now()->yesterday();

        $closedDay = WorkDay::create([
            'date' => $yesterday->toDateString(),
            'opened_by_user_id' => $admin->id,
            'opening_balance' => 500,
            'status' => 'open',
            'notes' => null,
        ]);

        $closedDay->employees()->attach($employees->pluck('id')->mapWithKeys(fn ($id) => [$id => ['present' => true]])->all());

        for ($i = 0; $i < 10; $i++) {
            $prestation = $prestations[array_rand($prestations)];
            $createdAt = $yesterday->copy()->setTime(random_int(9, 19), random_int(0, 59));

            $sale = Sale::create([
                'work_day_id' => $closedDay->id,
                'client_id' => fake()->boolean(70) ? $clients->random()->id : null,
                'client_label' => fake()->boolean(70) ? null : 'Client de passage',
                'employee_id' => $employees->random()->id,
                'category' => $prestation['category'],
                'total' => $prestation['price'],
                'commission_amount' => fake()->boolean(60) ? round($prestation['price'] * 0.4, 2) : null,
                'payment_method' => fake()->randomElement(['especes', 'carte']),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            SaleItem::create([
                'sale_id' => $sale->id,
                'itemable_type' => null,
                'itemable_id' => null,
                'label' => $prestation['label'],
                'quantity' => 1,
                'unit_price' => $prestation['price'],
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }

        for ($i = 0; $i < 2; $i++) {
            Expense::factory()->create([
                'work_day_id' => $closedDay->id,
                'spent_on' => $yesterday->toDateString(),
            ]);
        }

        Advance::create([
            'employee_id' => $employees->random()->id,
            'work_day_id' => $closedDay->id,
            'amount' => 100,
            'reason' => 'avance sur salaire',
            'given_on' => $yesterday->toDateString(),
            'settled_at' => now(),
        ]);

        // Close it via the same service logic the API uses, to guarantee the exact shape.
        $closingReport = app(WorkDayService::class)->buildClosingReport($closedDay);
        $closedDay->update([
            'status' => 'closed',
            'closed_at' => $yesterday->copy()->setTime(21, 30),
            'closing_report' => $closingReport,
        ]);

        // 2. Open work day for today.
        $today = now();

        $openDay = WorkDay::create([
            'date' => $today->toDateString(),
            'opened_by_user_id' => $admin->id,
            'opening_balance' => 500,
            'status' => 'open',
            'notes' => null,
        ]);

        $openDay->employees()->attach($employees->pluck('id')->mapWithKeys(fn ($id) => [$id => ['present' => true]])->all());

        $transactionCount = random_int(8, 12);

        for ($i = 0; $i < $transactionCount; $i++) {
            $prestation = $prestations[array_rand($prestations)];
            $createdAt = $today->copy()->subMinutes(random_int(0, 300));

            $sale = Sale::create([
                'work_day_id' => $openDay->id,
                'client_id' => fake()->boolean(70) ? $clients->random()->id : null,
                'client_label' => fake()->boolean(70) ? null : 'Client de passage',
                'employee_id' => $employees->random()->id,
                'category' => $prestation['category'],
                'total' => $prestation['price'],
                'commission_amount' => fake()->boolean(60) ? round($prestation['price'] * 0.4, 2) : null,
                'payment_method' => fake()->randomElement(['especes', 'carte']),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            SaleItem::create([
                'sale_id' => $sale->id,
                'itemable_type' => null,
                'itemable_id' => null,
                'label' => $prestation['label'],
                'quantity' => 1,
                'unit_price' => $prestation['price'],
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }

        for ($i = 0; $i < random_int(2, 3); $i++) {
            Expense::factory()->create([
                'work_day_id' => $openDay->id,
                'spent_on' => $today->toDateString(),
            ]);
        }

        Advance::create([
            'employee_id' => $employees->random()->id,
            'work_day_id' => $openDay->id,
            'amount' => 80,
            'reason' => 'avance sur salaire',
            'given_on' => $today->toDateString(),
            'settled_at' => null,
        ]);

        Advance::create([
            'employee_id' => $employees->random()->id,
            'work_day_id' => null,
            'amount' => 150,
            'reason' => 'avance urgente',
            'given_on' => $today->copy()->subDays(3)->toDateString(),
            'settled_at' => $today->copy()->subDay(),
        ]);
    }
}
