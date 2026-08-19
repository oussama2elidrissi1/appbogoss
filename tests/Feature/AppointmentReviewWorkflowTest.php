<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AppointmentReviewWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function createPartnerWithAccount(array $overrides = []): Partner
    {
        $user = User::factory()->create([
            'email' => $overrides['email'] ?? 'partner@test.com',
            'password' => Hash::make('secret-pass'),
            'role' => 'partner',
        ]);
        $user->assignRole('partner');

        return Partner::create(array_merge([
            'name' => 'Hotel Atlas',
            'is_active' => true,
            'user_id' => $user->id,
        ], $overrides['partner'] ?? []));
    }

    private function pendingBooking(Partner $partner, array $overrides = []): Appointment
    {
        return Appointment::factory()->create(array_merge([
            'partner_id' => $partner->id,
            'status' => 'pending',
            'starts_at' => '2026-08-25 10:00:00',
            'ends_at' => '2026-08-25 10:30:00',
        ], $overrides));
    }

    public function test_staff_can_confirm_a_pending_partner_booking_and_it_is_logged(): void
    {
        $admin = $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);

        $this->postJson("/api/appointments/{$appointment->id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'confirmed_by_user_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $appointment->id,
            'from_status' => 'pending',
            'to_status' => 'confirmed',
            'user_id' => $admin->id,
        ]);
    }

    public function test_staff_can_assign_employees_while_confirming(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $employee = Employee::factory()->create();
        $service = Service::factory()->create(['duration_minutes' => 30]);
        $appointment = $this->pendingBooking($partner, [
            'reservation_items' => [['service_id' => $service->id, 'employee_id' => null, 'person_index' => 0]],
        ]);

        $this->postJson("/api/appointments/{$appointment->id}/confirm", [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id, 'person_index' => 0]],
        ])
            ->assertOk()
            ->assertJsonPath('data.reservation_items.0.employee_id', $employee->id);
    }

    public function test_cannot_confirm_a_non_partner_appointment_through_review_endpoint(): void
    {
        $this->actingAsAdmin();
        $appointment = Appointment::factory()->create(['partner_id' => null, 'status' => 'pending']);

        $this->postJson("/api/appointments/{$appointment->id}/confirm")->assertStatus(422);
    }

    public function test_cannot_confirm_an_already_confirmed_booking(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner, ['status' => 'confirmed']);

        $this->postJson("/api/appointments/{$appointment->id}/confirm")->assertStatus(422);
    }

    public function test_partner_cannot_call_staff_only_review_actions(): void
    {
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);
        Sanctum::actingAs($partner->user);

        $this->postJson("/api/appointments/{$appointment->id}/confirm")->assertForbidden();
        $this->postJson("/api/appointments/{$appointment->id}/refuse")->assertForbidden();
        $this->postJson("/api/appointments/{$appointment->id}/propose-alternate", [
            'proposed_starts_at' => '2026-08-25 11:00:00',
            'proposed_ends_at' => '2026-08-25 11:30:00',
        ])->assertForbidden();
    }

    public function test_staff_can_refuse_with_a_reason(): void
    {
        $admin = $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);

        $this->postJson("/api/appointments/{$appointment->id}/refuse", ['reason' => 'Créneau indisponible'])
            ->assertOk()
            ->assertJsonPath('data.status', 'refused');

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'cancelled_by_user_id' => $admin->id,
            'cancellation_reason' => 'Créneau indisponible',
        ]);
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $appointment->id,
            'to_status' => 'refused',
            'reason' => 'Créneau indisponible',
        ]);
    }

    public function test_refused_booking_frees_the_slot_for_conflict_checks(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $employee = Employee::factory()->create();
        $appointment = $this->pendingBooking($partner, ['employee_id' => $employee->id]);

        $this->postJson("/api/appointments/{$appointment->id}/refuse")->assertOk();

        $client = Client::factory()->create();
        $service = Service::factory()->create(['duration_minutes' => 30]);
        $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-25 10:00:00',
        ])->assertCreated();
    }

    public function test_staff_can_propose_an_alternate_slot_and_partner_can_accept_it(): void
    {
        $admin = $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);

        $this->postJson("/api/appointments/{$appointment->id}/propose-alternate", [
            'proposed_starts_at' => '2026-08-25 15:00:00',
            'proposed_ends_at' => '2026-08-25 15:30:00',
            'proposal_note' => 'Créneau du matin complet',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.proposal_status', 'proposed');

        Sanctum::actingAs($partner->user);
        $this->postJson("/api/appointments/{$appointment->id}/proposal/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.proposal_status', 'accepted');

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'starts_at' => '2026-08-25 15:00:00',
            'ends_at' => '2026-08-25 15:30:00',
            'status' => 'confirmed',
        ]);
    }

    public function test_partner_can_decline_a_proposed_slot_and_original_stays_pending(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);

        $this->postJson("/api/appointments/{$appointment->id}/propose-alternate", [
            'proposed_starts_at' => '2026-08-25 15:00:00',
            'proposed_ends_at' => '2026-08-25 15:30:00',
        ])->assertOk();

        Sanctum::actingAs($partner->user);
        $this->postJson("/api/appointments/{$appointment->id}/proposal/decline")
            ->assertOk()
            ->assertJsonPath('data.proposal_status', 'declined')
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'starts_at' => '2026-08-25 10:00:00',
            'status' => 'pending',
        ]);
    }

    public function test_another_partner_cannot_act_on_a_proposal_that_is_not_theirs(): void
    {
        $this->actingAsAdmin();
        $ownerPartner = $this->createPartnerWithAccount();
        $otherPartner = $this->createPartnerWithAccount([
            'email' => 'other@test.com',
            'partner' => ['name' => 'Autre Hotel'],
        ]);
        $appointment = $this->pendingBooking($ownerPartner);

        $this->postJson("/api/appointments/{$appointment->id}/propose-alternate", [
            'proposed_starts_at' => '2026-08-25 15:00:00',
            'proposed_ends_at' => '2026-08-25 15:30:00',
        ])->assertOk();

        Sanctum::actingAs($otherPartner->user);
        $this->postJson("/api/appointments/{$appointment->id}/proposal/accept")->assertForbidden();
    }

    public function test_cannot_accept_a_proposal_that_does_not_exist(): void
    {
        $partner = $this->createPartnerWithAccount();
        $appointment = $this->pendingBooking($partner);
        Sanctum::actingAs($partner->user);

        $this->postJson("/api/appointments/{$appointment->id}/proposal/accept")->assertStatus(422);
    }

    public function test_partner_booking_workflow_notifies_the_right_people(): void
    {
        $admin = $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $service = Service::factory()->create();

        $created = $this->postJson('/api/appointments', [
            'client_id' => Client::factory()->create(['partner_id' => $partner->id])->id,
            'service_id' => $service->id,
            'starts_at' => '2026-08-25 10:00:00',
            'partner_id' => $partner->id,
            'status' => 'pending',
        ])->assertCreated()->json('data');

        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $admin->id,
            'type' => \App\Notifications\AppointmentNotification::class,
        ]);

        $this->postJson("/api/appointments/{$created['id']}/confirm")->assertOk();
        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $partner->user_id,
            'type' => \App\Notifications\AppointmentNotification::class,
        ]);
    }

    public function test_has_partner_filter_lists_bookings_across_every_partner(): void
    {
        $this->actingAsAdmin();
        $partnerA = $this->createPartnerWithAccount();
        $partnerB = $this->createPartnerWithAccount(['email' => 'b@test.com', 'partner' => ['name' => 'B']]);
        $this->pendingBooking($partnerA, ['starts_at' => '2026-08-25 09:00:00', 'ends_at' => '2026-08-25 09:30:00']);
        $this->pendingBooking($partnerB, ['starts_at' => '2026-08-25 11:00:00', 'ends_at' => '2026-08-25 11:30:00']);
        Appointment::factory()->create([
            'partner_id' => null,
            'status' => 'pending',
            'starts_at' => '2026-08-25 13:00:00',
            'ends_at' => '2026-08-25 13:30:00',
        ]);

        $this->getJson('/api/appointments?has_partner=1&date_from=2026-08-25&date_to=2026-08-25&status=pending')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_proposing_an_alternate_slot_that_conflicts_is_rejected(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $employee = Employee::factory()->create();
        $blocking = Appointment::factory()->create([
            'employee_id' => $employee->id,
            'status' => 'confirmed',
            'starts_at' => '2026-08-25 15:00:00',
            'ends_at' => '2026-08-25 15:30:00',
        ]);
        $appointment = $this->pendingBooking($partner, ['employee_id' => $employee->id]);

        $this->postJson("/api/appointments/{$appointment->id}/propose-alternate", [
            'proposed_starts_at' => '2026-08-25 15:00:00',
            'proposed_ends_at' => '2026-08-25 15:30:00',
        ])->assertStatus(422);
    }
}
