<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Service>
 */
class ServiceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $services = [
            'Coupe Homme' => 'coiffure',
            'Coupe Femme' => 'coiffure',
            'Coloration' => 'coiffure',
            'Balayage' => 'coiffure',
            'Brushing' => 'coiffure',
            'Taille de Barbe' => 'barbe',
            'Rasage Traditionnel' => 'barbe',
            'Soin Visage' => 'soin',
            'Soin du Cuir Chevelu' => 'soin',
            'Manucure' => 'esthetique',
            'Pedicure' => 'esthetique',
            'Epilation Sourcils' => 'esthetique',
        ];

        $name = fake()->randomElement(array_keys($services));

        return [
            'name' => $name,
            'category' => $services[$name],
            'duration_minutes' => fake()->numberBetween(15, 120),
            'price' => fake()->randomFloat(2, 15, 150),
            'color' => fake()->randomElement(['#C8A24C', '#4C7CC8', '#2E7D5B', '#8C6BC8', '#C84C6B']),
            'is_active' => true,
        ];
    }
}
