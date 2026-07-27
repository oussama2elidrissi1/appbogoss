<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_crud_endpoints_work(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Service::factory()->create([
            'name' => 'Inactive service',
            'category' => 'coiffure',
            'is_active' => false,
        ]);

        $this->getJson('/api/services?category=coiffure')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Inactive service']);

        $created = $this->postJson('/api/services', [
            'name' => 'Service test CRUD',
            'category' => 'coiffure',
            'duration_minutes' => 35,
            'price' => 90,
            'color' => '#C8A24C',
            'is_active' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Service test CRUD')
            ->assertJsonPath('data.price', 90)
            ->json('data');

        $this->getJson('/api/services?category=coiffure&include_inactive=1')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Inactive service'])
            ->assertJsonFragment(['name' => 'Service test CRUD']);

        $this->patchJson('/api/services/'.$created['id'], [
            'price' => 120,
            'is_active' => false,
        ])
            ->assertOk()
            ->assertJsonPath('data.price', 120)
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.name', 'Service test CRUD');

        $this->deleteJson('/api/services/'.$created['id'])
            ->assertNoContent();

        $this->assertDatabaseMissing('services', ['id' => $created['id']]);
    }
}
