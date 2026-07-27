<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Client>
 */
class ClientFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $colors = ['#4C7CC8', '#C8A24C', '#2E7D5B', '#8C6BC8', '#C84C6B', '#6B8CC8'];

        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->numerify('07########'),
            'avatar_color' => fake()->randomElement($colors),
            'loyalty_points' => fake()->numberBetween(0, 500),
            'notes' => fake()->optional(0.3)->sentence(),
            'last_visit_at' => fake()->dateTimeBetween('-60 days', 'now'),
        ];
    }
}
