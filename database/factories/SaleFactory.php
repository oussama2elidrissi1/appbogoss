<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Sale>
 */
class SaleFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_id' => Client::factory(),
            'employee_id' => Employee::factory(),
            'total' => fake()->randomFloat(2, 15, 300),
            'payment_method' => fake()->randomElement(['carte', 'especes', 'cheque']),
        ];
    }
}
