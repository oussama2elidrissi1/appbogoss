<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
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

        $this->command?->info('Demo data seeded. Admin login: admin@bogosland.com / password (user #'.$admin->id.').');
    }
}
