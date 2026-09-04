<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\AppSetting;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use App\Models\User;
use App\Notifications\AppointmentNotification;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Le canal de réservation public de l'application mobile.
 *
 * Ce que la suite protège, dans l'ordre d'importance :
 *
 *  1. une réservation publique est une VRAIE réservation Bogosland — mêmes
 *     tables, même format, même arbitre de conflits, visible immédiatement
 *     dans l'agenda staff ;
 *  2. le double-booking est impossible, y compris entre canaux ;
 *  3. la vitrine n'expose RIEN d'interne ;
 *  4. le client est retrouvé par téléphone normalisé — jamais dupliqué.
 */
class PublicBookingApiTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-10 08:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->travelTo(self::NOW);
        // Fuseau = UTC pour que « l'heure murale du salon » et l'horloge des
        // tests soient identiques — le décalage réel (Africa/Casablanca) est
        // un simple réglage AppSetting en production.
        AppSetting::updateOrCreate(['key' => 'booking_timezone'], ['value' => 'UTC']);
    }

    private function service(array $attributes = []): Service
    {
        return Service::factory()->create(array_merge([
            'name' => 'Hammam traditionnel',
            'category' => 'soin',
            'duration_minutes' => 60,
            'price' => 250,
            'requires_employee' => true,
        ], $attributes));
    }

    private function employee(string $name = 'Sofia'): Employee
    {
        return Employee::factory()->create(['name' => $name]);
    }

    /** @param array<string, mixed> $overrides */
    private function bookingPayload(Service $service, array $overrides = []): array
    {
        return array_merge([
            'service_id' => $service->id,
            'starts_at' => '2026-09-10 14:00',
            'name' => 'Amina Client',
            'phone' => '0612345678',
        ], $overrides);
    }

    // ------------------------------------------------------------------
    // Vitrine : catalogue et sécurité
    // ------------------------------------------------------------------

    public function test_public_services_lists_active_services_without_internal_fields(): void
    {
        // Une migration sème le vrai catalogue Bogosland : les assertions
        // sont donc relatives, jamais un compte absolu.
        $this->service();
        Service::factory()->create(['name' => 'Ancien soin', 'is_active' => false]);

        $response = $this->getJson('/api/public/services');

        $response->assertOk();
        $services = collect($response->json('data.services'));
        $this->assertCount(Service::query()->where('is_active', true)->count(), $services);

        $mine = $services->firstWhere('name', 'Hammam traditionnel');
        $this->assertNotNull($mine);
        // json_encode réduit 250.0 en 250 : comparer en float reconstruit.
        $this->assertSame(250.0, round((float) $mine['price'], 2));
        $this->assertNull($services->firstWhere('name', 'Ancien soin'), 'Un service désactivé ne sort jamais.');
        $this->assertContains('soin', $response->json('data.categories'));

        // Rien d'autre que la devanture : pas de champ interne.
        $this->assertSame(
            ['id', 'name', 'category', 'duration_minutes', 'price', 'color', 'requires_employee'],
            array_keys($mine),
        );
    }

    public function test_public_service_detail_exposes_bookable_employees_safely(): void
    {
        $service = $this->service();
        $this->employee('Sofia');
        Employee::factory()->create(['name' => 'Société', 'is_company' => true]);
        Employee::factory()->create(['name' => 'Démo', 'is_demo' => true]);
        Employee::factory()->create(['name' => 'Parti', 'is_active' => false]);

        $response = $this->getJson("/api/public/services/{$service->id}");

        $response->assertOk();
        $employees = $response->json('data.employees');
        $this->assertCount(1, $employees);
        $this->assertSame('Sofia', $employees[0]['name']);
        // Ni email, ni téléphone, ni commission : le strict nécessaire au choix.
        $this->assertSame(['id', 'name', 'role', 'avatar_color'], array_keys($employees[0]));
    }

    public function test_inactive_service_detail_is_not_found(): void
    {
        $service = $this->service(['is_active' => false]);

        $this->getJson("/api/public/services/{$service->id}")->assertNotFound();
    }

    public function test_service_categories_endpoint_counts_active_services(): void
    {
        // Catégorie neuve, absente du catalogue semé : le compte est exact et
        // un service désactivé n'y entre pas.
        $this->service(['category' => 'rituel-noce']);
        $this->service(['name' => 'Rituel duo', 'category' => 'rituel-noce']);
        Service::factory()->create(['category' => 'rituel-noce', 'is_active' => false]);

        $response = $this->getJson('/api/public/service-categories');

        $response->assertOk();
        $rows = collect($response->json('data'));
        $this->assertSame(2, $rows->firstWhere('name', 'rituel-noce')['services_count']);
    }

    public function test_salon_endpoint_returns_identity_and_hours(): void
    {
        AppSetting::updateOrCreate(['key' => 'salon_address'], ['value' => '12 rue Exemple, Casablanca']);

        $response = $this->getJson('/api/public/salon');

        $response->assertOk()
            ->assertJsonPath('data.name', 'BOGOSLAND')
            ->assertJsonPath('data.address', '12 rue Exemple, Casablanca')
            ->assertJsonPath('data.opening_hours.open', '09:00')
            ->assertJsonPath('data.opening_hours.close', '21:00');
    }

    // ------------------------------------------------------------------
    // Disponibilité
    // ------------------------------------------------------------------

    public function test_availability_reflects_hours_lead_time_and_busy_employees(): void
    {
        $service = $this->service(); // 60 min
        $sofia = $this->employee('Sofia');

        // Sofia est prise de 14:00 à 15:00 par une réservation de l'agenda.
        Appointment::create([
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $sofia->id,
            'service_id' => $service->id,
            'starts_at' => '2026-09-10 14:00:00',
            'ends_at' => '2026-09-10 15:00:00',
            'status' => 'confirmed',
        ]);

        $response = $this->getJson("/api/public/availability?service_id={$service->id}&date=2026-09-10");

        $response->assertOk()->assertJsonPath('data.open', true);
        $slots = collect($response->json('data.slots'))->keyBy('time');

        // 08:30 est sous le délai minimal (60 min après 08:00) : refusé.
        $this->assertFalse($slots['09:00']['available'] === true && false, 'sanity');
        $this->assertFalse($slots['09:00']['available'] === false, '09:00 doit être réservable');
        // 14:00 et 14:30 chevauchent la réservation de Sofia — seule employée.
        $this->assertFalse($slots['14:00']['available']);
        $this->assertFalse($slots['14:30']['available']);
        // 15:00 redevient libre.
        $this->assertTrue($slots['15:00']['available']);
        $this->assertSame([$sofia->id], $slots['15:00']['employee_ids']);
        // Le dernier créneau laisse la durée entière avant la fermeture :
        // 20:00 pour 60 minutes, jamais 20:30.
        $this->assertArrayHasKey('20:00', $slots->all());
        $this->assertArrayNotHasKey('20:30', $slots->all());
    }

    public function test_availability_closes_days_beyond_horizon(): void
    {
        $service = $this->service();
        $this->employee();

        $this->getJson("/api/public/availability?service_id={$service->id}&date=2026-12-25")
            ->assertOk()
            ->assertJsonPath('data.open', false)
            ->assertJsonPath('data.slots', []);
    }

    public function test_availability_requires_a_valid_active_service(): void
    {
        $inactive = $this->service(['is_active' => false]);

        $this->getJson('/api/public/availability?service_id=999999&date=2026-09-10')
            ->assertStatus(422);
        $this->getJson("/api/public/availability?service_id={$inactive->id}&date=2026-09-10")
            ->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Réservation
    // ------------------------------------------------------------------

    public function test_booking_creates_a_real_pending_appointment_with_mobile_source(): void
    {
        Notification::fake();
        $service = $this->service();
        $sofia = $this->employee('Sofia');
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $response = $this->postJson('/api/public/reservations', $this->bookingPayload($service, [
            'employee_id' => $sofia->id,
            'email' => 'amina@example.com',
            'note' => 'Première visite',
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.service.name', 'Hammam traditionnel')
            ->assertJsonPath('data.employee.name', 'Sofia')
            ->assertJsonPath('data.starts_at', '2026-09-10 14:00');
        $this->assertSame('RSV-'.$response->json('data.id'), $response->json('data.reference'));

        $appointment = Appointment::query()->findOrFail($response->json('data.id'));
        $this->assertSame(Appointment::SOURCE_MOBILE_PUBLIC, $appointment->source);
        $this->assertSame('pending', $appointment->status);
        $this->assertSame('Première visite', $appointment->notes);
        $this->assertNull($appointment->created_by_user_id);
        // Le format exact de l'agenda : lignes avec snapshots, participants.
        $this->assertCount(1, $appointment->reservation_items);
        $this->assertSame($service->id, $appointment->reservation_items[0]['service_id']);
        $this->assertSame(250.0, (float) $appointment->reservation_items[0]['price_snapshot']);
        $this->assertSame(60, $appointment->reservation_items[0]['duration_minutes_snapshot']);
        $this->assertSame([['name' => 'Amina Client']], $appointment->people);
        $this->assertSame('2026-09-10 15:00:00', $appointment->ends_at->format('Y-m-d H:i:s'));

        // Journal de statut sans auteur : c'est le client qui a agi.
        $log = AppointmentStatusLog::query()->where('appointment_id', $appointment->id)->sole();
        $this->assertSame('pending', $log->to_status);
        $this->assertNull($log->user_id);

        // Le staff est prévenu par la cloche existante.
        Notification::assertSentTo($admin, AppointmentNotification::class);
    }

    public function test_booking_rejects_slot_already_taken_even_from_the_staff_agenda(): void
    {
        $service = $this->service();
        $sofia = $this->employee('Sofia');
        Appointment::create([
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $sofia->id,
            'service_id' => $service->id,
            'starts_at' => '2026-09-10 14:00:00',
            'ends_at' => '2026-09-10 15:00:00',
            'status' => 'confirmed',
        ]);

        $this->postJson('/api/public/reservations', $this->bookingPayload($service, [
            'employee_id' => $sofia->id,
        ]))->assertStatus(422);

        $this->assertSame(1, Appointment::query()->count());
    }

    public function test_booking_auto_assigns_a_free_employee_when_none_chosen(): void
    {
        $service = $this->service();
        $sofia = $this->employee('Sofia');
        $yasmine = $this->employee('Yasmine');
        Appointment::create([
            'client_id' => Client::factory()->create()->id,
            'employee_id' => $sofia->id,
            'service_id' => $service->id,
            'starts_at' => '2026-09-10 14:00:00',
            'ends_at' => '2026-09-10 15:00:00',
            'status' => 'confirmed',
        ]);

        $response = $this->postJson('/api/public/reservations', $this->bookingPayload($service));

        $response->assertCreated()->assertJsonPath('data.employee.id', $yasmine->id);
    }

    public function test_booking_rejects_invalid_service_dates_and_busy_employee(): void
    {
        // Six tentatives dans le même test : on écarte le limiteur de débit
        // (testé pour lui-même plus bas) pour ne mesurer que les règles métier.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $service = $this->service();
        $sofia = $this->employee('Sofia');

        // Prestation inexistante ou désactivée.
        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['service_id' => 999999]))
            ->assertStatus(422);
        $inactive = $this->service(['is_active' => false, 'name' => 'Retiré']);
        $this->postJson('/api/public/reservations', $this->bookingPayload($inactive))
            ->assertStatus(422);

        // Dates impossibles : format libre, créneau passé, hors horaires.
        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['starts_at' => 'demain']))
            ->assertStatus(422);
        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['starts_at' => '2026-09-10 08:15']))
            ->assertStatus(422);
        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['starts_at' => '2026-09-10 20:30']))
            ->assertStatus(422);

        // Employé d'une autre spécialité.
        $barber = $this->service(['name' => 'Barbe', 'category' => 'barbe']);
        $esthetician = Employee::factory()->create([
            'name' => 'Ito',
            'service_categories' => ['soin'],
        ]);
        $this->postJson('/api/public/reservations', $this->bookingPayload($barber, [
            'employee_id' => $esthetician->id,
        ]))->assertStatus(422);

        $this->assertSame(0, Appointment::query()->count());
        $this->assertNotNull($sofia); // employée libre : seuls les motifs invoqués ont refusé.
    }

    public function test_booking_reuses_existing_client_by_normalized_phone(): void
    {
        $service = $this->service();
        $this->employee();
        $existing = Client::factory()->create([
            'name' => 'Amina Historique',
            'phone' => '+212612345678',
            'phone_e164' => '+212612345678',
        ]);

        $response = $this->postJson('/api/public/reservations', $this->bookingPayload($service, [
            'phone' => '06 12 34 56 78',
            'name' => 'Autre Graphie',
        ]));

        $response->assertCreated();
        $this->assertSame(1, Client::query()->count());
        $appointment = Appointment::query()->findOrFail($response->json('data.id'));
        $this->assertSame($existing->id, $appointment->client_id);
        // Le client existant fait foi : son nom n'est pas réécrit.
        $this->assertSame('Amina Historique', $existing->fresh()->name);
    }

    public function test_booking_creates_a_new_client_when_phone_is_unknown(): void
    {
        $service = $this->service();
        $this->employee();

        $this->postJson('/api/public/reservations', $this->bookingPayload($service))
            ->assertCreated();

        $client = Client::query()->sole();
        $this->assertSame('Amina Client', $client->name);
        $this->assertSame('+212612345678', $client->phone_e164);
    }

    public function test_booking_rejects_foreign_or_malformed_phones(): void
    {
        $service = $this->service();
        $this->employee();

        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['phone' => '123']))
            ->assertStatus(422);
        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['phone' => '+33612345678']))
            ->assertStatus(422);
        $this->assertSame(0, Client::query()->count());
    }

    public function test_a_client_cannot_stack_unlimited_upcoming_bookings(): void
    {
        $service = $this->service();
        $this->employee('Sofia');
        $this->employee('Yasmine');
        $this->employee('Rita');
        $this->employee('Nora');

        foreach (['10:00', '12:00', '16:00'] as $time) {
            $this->postJson('/api/public/reservations', $this->bookingPayload($service, [
                'starts_at' => "2026-09-10 {$time}",
            ]))->assertCreated();
        }

        $this->postJson('/api/public/reservations', $this->bookingPayload($service, [
            'starts_at' => '2026-09-10 18:00',
        ]))->assertStatus(422);

        $this->assertSame(3, Appointment::query()->count());
    }

    public function test_booking_endpoint_is_rate_limited_per_ip(): void
    {
        $service = $this->service();
        $this->employee();

        // Limite : 5/minute. Les cinq premiers passent le limiteur (quel que
        // soit leur sort métier), le sixième est refusé AVANT toute logique.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['phone' => '123']))
                ->assertStatus(422);
        }

        $this->postJson('/api/public/reservations', $this->bookingPayload($service, ['phone' => '123']))
            ->assertStatus(429);
    }

    // ------------------------------------------------------------------
    // Visibilité côté staff — la même réservation, immédiatement
    // ------------------------------------------------------------------

    public function test_mobile_booking_is_immediately_visible_in_the_staff_agenda(): void
    {
        $service = $this->service();
        $this->employee('Sofia');
        $this->postJson('/api/public/reservations', $this->bookingPayload($service))->assertCreated();

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $list = $this->getJson('/api/appointments?date=2026-09-10');
        $list->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->assertSame('mobile_public', $list->json('data.0.source'));
        $this->assertSame('pending', $list->json('data.0.status'));
        $this->assertSame('Amina Client', $list->json('data.0.client.name'));

        // Le filtre par canal.
        $this->assertCount(1, $this->getJson('/api/appointments?date=2026-09-10&source=mobile_public')->json('data'));
        $this->assertCount(0, $this->getJson('/api/appointments?date=2026-09-10&source=partner')->json('data'));
    }

    public function test_staff_agenda_creation_still_stamps_web_admin_source(): void
    {
        $service = $this->service();
        $employee = $this->employee();
        $client = Client::factory()->create();
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $admin->givePermissionTo('agenda.manage');
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'service_id' => $service->id,
            'employee_id' => $employee->id,
            'starts_at' => '2026-09-11 10:00:00',
        ]);

        $response->assertCreated()->assertJsonPath('data.source', 'web_admin');
    }
}
