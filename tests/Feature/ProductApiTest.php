<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_product_crud_endpoints_work(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        Product::factory()->create([
            'name' => 'Huile argan',
            'sku' => 'HUILE-ARGAN',
            'category' => 'vitrine',
            'price' => 90,
            'stock_quantity' => 4,
            'low_stock_threshold' => 5,
        ]);

        $this->getJson('/api/products?search=argan')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Huile argan');

        $created = $this->postJson('/api/products', [
            'name' => 'Shampooing test',
            'category' => 'vitrine',
            'price' => 70,
            'cost' => 35,
            'stock_quantity' => 12,
            'low_stock_threshold' => 3,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Shampooing test')
            ->assertJsonPath('data.price', 70)
            ->json('data');

        $this->assertNotEmpty($created['sku']);

        $this->patchJson('/api/products/'.$created['id'], [
            'price' => 80,
            'stock_quantity' => 9,
        ])
            ->assertOk()
            ->assertJsonPath('data.price', 80)
            ->assertJsonPath('data.stock_quantity', 9);

        $this->deleteJson('/api/products/'.$created['id'])
            ->assertNoContent();

        $this->assertDatabaseMissing('products', ['id' => $created['id']]);
    }
}
