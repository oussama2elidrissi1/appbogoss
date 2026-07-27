<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\Sale;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SaleItem>
 */
class SaleItemFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $unitPrice = fake()->randomFloat(2, 10, 80);

        return [
            'sale_id' => Sale::factory(),
            'itemable_type' => Product::class,
            'itemable_id' => Product::factory(),
            'label' => fake()->words(2, true),
            'quantity' => fake()->numberBetween(1, 3),
            'unit_price' => $unitPrice,
        ];
    }
}
