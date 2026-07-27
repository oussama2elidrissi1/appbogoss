<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Expense>
 */
class ExpenseFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $labels = [
            'loyer' => ['Loyer mensuel du salon'],
            'fournitures' => ['Achat de produits capillaires', 'Materiel de coiffure', 'Serviettes et peignoirs'],
            'salaires' => ['Salaire equipe', 'Prime performance'],
            'marketing' => ['Campagne reseaux sociaux', 'Flyers publicitaires', 'Photographe evenement'],
            'autre' => ['Entretien du materiel', 'Facture electricite', 'Assurance professionnelle'],
        ];

        $category = fake()->randomElement(array_keys($labels));

        $amountRanges = [
            'loyer' => [700, 1200],
            'fournitures' => [30, 250],
            'salaires' => [400, 900],
            'marketing' => [40, 300],
            'autre' => [20, 200],
        ];

        [$min, $max] = $amountRanges[$category];

        return [
            'label' => fake()->randomElement($labels[$category]),
            'category' => $category,
            'amount' => fake()->randomFloat(2, $min, $max),
            'spent_on' => fake()->dateTimeBetween('-90 days', 'now')->format('Y-m-d'),
        ];
    }
}
