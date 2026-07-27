<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Employee>
 */
class EmployeeFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $colors = ['#C8A24C', '#4C7CC8', '#2E7D5B', '#8C6BC8', '#C84C6B', '#1B2A4A', '#B8860B'];

        return [
            'user_id' => null,
            'name' => fake()->name(),
            'role' => fake()->randomElement(['coiffeur', 'coiffeuse', 'barbier', 'estheticienne', 'manager']),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->numerify('06########'),
            'avatar_color' => fake()->randomElement($colors),
            'specialties' => fake()->randomElements(
                ['Coupe', 'Coloration', 'Balayage', 'Barbe', 'Soin visage', 'Manucure', 'Coiffure mariage'],
                fake()->numberBetween(1, 3)
            ),
            'is_active' => true,
        ];
    }
}
