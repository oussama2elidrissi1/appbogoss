<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeServiceCommission;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
    }

    public function test_deleted_ticket_stays_visible_in_day_history(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $sale = Sale::factory()->create([
            'work_day_id' => $workDay->id,
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 70,
            'commission_amount' => 20,
        ]);

        SaleItem::factory()->create([
            'sale_id' => $sale->id,
            'label' => 'Coupe cheveux + barbe',
            'quantity' => 1,
            'unit_price' => 70,
        ]);

        $this->deleteJson('/api/transactions/'.$sale->id)
            ->assertOk()
            ->assertJsonPath('data.id', $sale->id)
            ->assertJsonPath('data.is_deleted', true);

        $this->assertSoftDeleted('sales', ['id' => $sale->id]);

        $this->getJson('/api/transactions?work_day_id='.$workDay->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $sale->id)
            ->assertJsonPath('data.0.is_deleted', true)
            ->assertJsonPath('data.0.items.0.label', 'Coupe cheveux + barbe');
    }

    public function test_print_count_is_recorded_and_incremented(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create();
        $workDay = WorkDay::factory()->create(['status' => 'open']);

        $created = $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'category' => 'hammam',
            'label' => 'Hammam turc',
            'price' => 150,
        ])
            ->assertCreated()
            ->assertJsonPath('data.print_count', 1)
            ->json('data');

        $this->postJson('/api/transactions/'.$created['id'].'/print')
            ->assertOk()
            ->assertJsonPath('data.print_count', 2);

        $this->assertDatabaseHas('sales', [
            'id' => $created['id'],
            'work_day_id' => $workDay->id,
            'print_count' => 2,
        ]);
    }

    public function test_store_auto_calculates_commission_from_the_employees_default_rate_when_left_blank(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        WorkDay::factory()->create(['status' => 'open']);

        $response = $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'label' => 'Coupe cheveux + barbe',
            'price' => 100,
        ]);

        $response->assertCreated();
        $this->assertEquals(40, $response->json('data.commission_amount'));
    }

    public function test_store_auto_calculates_commission_from_a_per_service_rule_when_service_id_is_given(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        $service = Service::factory()->create(['category' => 'coiffure', 'name' => 'Coupe cheveux + barbe']);
        EmployeeServiceCommission::create([
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'percentage',
            'value' => 70,
            'starts_on' => now()->subDays(30)->toDateString(),
            'is_active' => true,
        ]);
        WorkDay::factory()->create(['status' => 'open']);

        $response = $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'service_id' => $service->id,
            'label' => 'Coupe cheveux + barbe',
            'price' => 100,
        ]);

        $response->assertCreated();
        // The per-service rule (70%) wins over the flat default rate (40%).
        $this->assertEquals(70, $response->json('data.commission_amount'));
        $this->assertDatabaseHas('sales', ['id' => $response->json('data.id'), 'service_id' => $service->id]);
    }

    public function test_store_respects_an_explicit_commission_override(): void
    {
        $this->actingAsAdmin();

        $employee = Employee::factory()->create(['default_commission_rate' => 40]);
        WorkDay::factory()->create(['status' => 'open']);

        $response = $this->postJson('/api/transactions', [
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'label' => 'Coupe cheveux + barbe',
            'price' => 100,
            'commission_amount' => 5,
        ]);

        $response->assertCreated();
        $this->assertEquals(5, $response->json('data.commission_amount'));
    }
}
