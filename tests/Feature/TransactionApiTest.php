<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Models\WorkDay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_deleted_ticket_stays_visible_in_day_history(): void
    {
        Sanctum::actingAs(User::factory()->create());

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
}
