<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Product>
 */
class ProductFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $products = [
            'Shampoing Nourrissant',
            'Apres-Shampoing Reparateur',
            'Masque Capillaire',
            'Huile de Soin Argan',
            'Cire Coiffante',
            'Gel Coiffant Fort',
            'Laque Fixation Extreme',
            'Serum Anti-Frisottis',
            'Creme de Rasage',
            'Baume a Barbe',
            'Lotion Apres-Rasage',
            'Creme Hydratante Visage',
            'Vernis a Ongles',
            'Dissolvant Sans Acetone',
            'Spray Protecteur Chaleur',
        ];

        $price = fake()->randomFloat(2, 8, 60);

        return [
            'name' => fake()->randomElement($products),
            'sku' => strtoupper('SKU-'.fake()->unique()->bothify('####??')),
            'category' => fake()->randomElement(['coiffure', 'barbe', 'soin', 'esthetique']),
            'price' => $price,
            'cost' => round($price * fake()->randomFloat(2, 0.35, 0.6), 2),
            'stock_quantity' => fake()->numberBetween(0, 100),
            'low_stock_threshold' => fake()->numberBetween(5, 15),
        ];
    }
}
