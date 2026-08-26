<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosV2AppointmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);

        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');
        Sanctum::actingAs($user);
    }

    public function test_reservation_opens_in_the_caisse_with_snapshot_prices_employees_and_beneficiaries(): void
    {
        $client = Client::factory()->create(['name' => 'Ahmed El Idrissi']);
        $omar = Employee::factory()->create(['name' => 'Omar']);
        $hamza = Employee::factory()->create(['name' => 'Hamza']);
        $hammam = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);
        $massage = Service::factory()->create(['name' => 'Massage', 'category' => 'massage', 'price' => 250]);

        $appointment = Appointment::factory()->create([
            'client_id' => $client->id,
            'employee_id' => $omar->id,
            'service_id' => $hammam->id,
            'status' => 'confirmed',
            'starts_at' => now()->setTime(15, 0),
            'ends_at' => now()->setTime(16, 0),
            'people' => [['name' => 'Ahmed'], ['name' => 'Yassine']],
            'reservation_items' => [
                [
                    'uid' => 'a1',
                    'service_id' => $hammam->id,
                    'employee_id' => $omar->id,
                    'person_index' => 0,
                    // Snapshot deliberately different from today's price to
                    // prove the booking-time price is honoured.
                    'price_snapshot' => 140,
                    'duration_minutes_snapshot' => 45,
                ],
                [
                    'uid' => 'a2',
                    'service_id' => $massage->id,
                    'employee_id' => $hamza->id,
                    'person_index' => 1,
                    'price_snapshot' => 250,
                    'duration_minutes_snapshot' => 30,
                ],
            ],
        ]);

        $invoice = $this->postJson("/api/pos-v2/appointments/{$appointment->id}/open")
            ->assertCreated()->json('data');

        $this->assertSame($client->id, $invoice['client_id']);
        $this->assertSame($appointment->id, $invoice['appointment_id']);
        $this->assertCount(2, $invoice['items']);
        $this->assertEquals(140, $invoice['items'][0]['unit_price']);
        $this->assertSame('Omar', $invoice['items'][0]['employee_name']);
        $this->assertSame('Ahmed', $invoice['items'][0]['beneficiary_name']);
        $this->assertSame('Hamza', $invoice['items'][1]['employee_name']);
        $this->assertSame('Yassine', $invoice['items'][1]['beneficiary_name']);
        $this->assertEquals(390, $invoice['total']);

        // §37 — extra service added on the spot lives on the same invoice.
        $extra = $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/lines", [
            'service_id' => $massage->id,
            'employee_id' => $omar->id,
        ])->assertCreated()->json('data');
        $this->assertEquals(640, $extra['total']);

        // Re-opening returns the SAME invoice instead of duplicating it.
        $again = $this->postJson("/api/pos-v2/appointments/{$appointment->id}/open")->json('data');
        $this->assertSame($invoice['id'], $again['id']);
    }

    public function test_today_listing_flags_reservations_already_opened(): void
    {
        $client = Client::factory()->create();
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['price' => 100]);

        $appointment = Appointment::factory()->create([
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'status' => 'confirmed',
            'starts_at' => now()->setTime(10, 0),
            'ends_at' => now()->setTime(10, 30),
        ]);
        $cancelled = Appointment::factory()->create([
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'status' => 'cancelled',
            'starts_at' => now()->setTime(11, 0),
            'ends_at' => now()->setTime(11, 30),
        ]);

        $before = $this->getJson('/api/pos-v2/appointments/today')->assertOk()->json('data');
        $this->assertCount(1, $before);
        $this->assertNull($before[0]['invoice_id']);

        $invoice = $this->postJson("/api/pos-v2/appointments/{$appointment->id}/open")->json('data');

        $after = $this->getJson('/api/pos-v2/appointments/today')->json('data');
        $this->assertSame($invoice['id'], $after[0]['invoice_id']);

        // A cancelled reservation cannot be opened.
        $this->postJson("/api/pos-v2/appointments/{$cancelled->id}/open")->assertStatus(422);
    }
}
