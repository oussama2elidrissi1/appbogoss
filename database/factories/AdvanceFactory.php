<?php

namespace Database\Factories;

use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Advance>
 */
class AdvanceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'work_day_id' => null,
            'amount' => fake()->randomFloat(2, 50, 300),
            'reason' => fake()->optional()->sentence(3),
            'given_on' => fake()->dateTimeBetween('-30 days', 'now')->format('Y-m-d'),
            'settled_at' => null,
        ];
    }
}
