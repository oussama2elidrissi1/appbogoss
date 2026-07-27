<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\WorkDay>
 */
class WorkDayFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'date' => fake()->unique()->dateTimeBetween('-30 days', 'now')->format('Y-m-d'),
            'opened_by_user_id' => null,
            'opening_balance' => fake()->randomFloat(2, 200, 800),
            'status' => 'open',
            'closed_at' => null,
            'closing_report' => null,
            'notes' => null,
        ];
    }
}
