<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_crud_endpoints_work(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

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

    public function test_index_accepts_every_category_including_vitrine_and_autre(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/services?category=vitrine')->assertOk();
        $this->getJson('/api/services?category=autre')->assertOk();
    }

    public function test_index_orders_services_by_the_requesting_employees_own_usage(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);
        $otherEmployee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $rarelyUsed = Service::factory()->create(['category' => 'coiffure', 'name' => 'Rarement utilise']);
        $neverUsed = Service::factory()->create(['category' => 'coiffure', 'name' => 'Jamais utilise']);
        $mostUsed = Service::factory()->create(['category' => 'coiffure', 'name' => 'Souvent utilise']);

        // This employee uses $mostUsed three times and $rarelyUsed once.
        foreach ([$mostUsed, $mostUsed, $mostUsed, $rarelyUsed] as $index => $service) {
            $prestation = Prestation::create([
                'reference' => 'PRE-TEST-'.$index,
                'work_day_id' => $workDay->id,
                'employee_id' => $employee->id,
                'created_by_user_id' => $user->id,
                'status' => 'in_progress',
            ]);
            PrestationItem::create([
                'prestation_id' => $prestation->id,
                'service_id' => $service->id,
                'label' => $service->name,
                'quantity' => 1,
                'unit_price' => $service->price,
            ]);
        }

        // Another employee's own heavy usage of $rarelyUsed must not bleed
        // into this employee's personal ranking.
        $otherPrestation = Prestation::create([
            'reference' => 'PRE-TEST-OTHER',
            'work_day_id' => $workDay->id,
            'employee_id' => $otherEmployee->id,
            'created_by_user_id' => $user->id,
            'status' => 'in_progress',
        ]);
        PrestationItem::create([
            'prestation_id' => $otherPrestation->id,
            'service_id' => $rarelyUsed->id,
            'label' => $rarelyUsed->name,
            'quantity' => 1,
            'unit_price' => $rarelyUsed->price,
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson('/api/services?category=coiffure')->assertOk();

        // The catalog is pre-seeded with plenty of other coiffure services
        // (see the service-catalog migration), so only relative order among
        // these three is asserted, not the full list.
        $names = collect($response->json('data'))->pluck('name')->all();
        $mostUsedPosition = array_search($mostUsed->name, $names, true);
        $rarelyUsedPosition = array_search($rarelyUsed->name, $names, true);
        $neverUsedPosition = array_search($neverUsed->name, $names, true);

        $this->assertNotFalse($mostUsedPosition);
        $this->assertNotFalse($rarelyUsedPosition);
        $this->assertNotFalse($neverUsedPosition);
        $this->assertLessThan($rarelyUsedPosition, $mostUsedPosition);
        $this->assertLessThan($neverUsedPosition, $rarelyUsedPosition);
    }
}
