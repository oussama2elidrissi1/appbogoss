<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\PartnerOffering;
use App\Models\PartnerQrToken;
use App\Models\PartnerQrVisit;
use App\Models\PartnerServiceCommission;
use App\Models\Prestation;
use App\Models\Service;
use App\Models\ServicePack;
use App\Models\ServicePackItem;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PartnerQrService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * LE QR PARTENAIRE, de bout en bout.
 *
 * La garantie qui compte et que presque chaque test reprend : le partenaire
 * d'une reservation vient du JETON de l'URL, jamais du corps de la requete.
 * Le reste verifie que la vitrine d'un partenaire est bien la sienne, que la
 * commission tombe une fois et au bon endroit, et que rien de l'existant ne
 * change pour une reservation sans QR.
 */
class PartnerQrApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    // ------------------------------------------------------------- outils

    private function partner(string $name, string $status = Partner::STATUS_ACTIVE): Partner
    {
        $user = User::factory()->create(['role' => 'partner']);
        $user->assignRole('partner');

        return Partner::create([
            'name' => $name,
            'status' => $status,
            'is_active' => $status === Partner::STATUS_ACTIVE,
            'user_id' => $user->id,
        ]);
    }

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    private function token(Partner $partner): string
    {
        return app(PartnerQrService::class)->currentToken($partner)->token;
    }

    private function bookableService(string $name = 'Coupe', float $price = 80): Service
    {
        // Un employe actif est necessaire : sans lui aucun creneau n'est
        // reservable, exactement comme pour la vitrine publique.
        Employee::factory()->create(['is_active' => true]);

        return Service::factory()->create([
            'name' => $name,
            'category' => 'coiffure',
            'price' => $price,
            'duration_minutes' => 30,
            'is_active' => true,
            'requires_employee' => true,
        ]);
    }

    private function offerService(Partner $partner, Service $service, array $overrides = []): PartnerOffering
    {
        return PartnerOffering::create(array_merge([
            'partner_id' => $partner->id,
            'kind' => PartnerOffering::KIND_SERVICE,
            'service_id' => $service->id,
            'is_active' => true,
        ], $overrides));
    }

    /** Un creneau sur, dans la fenetre d'ouverture et au-dela du delai mini. */
    private function slot(): string
    {
        return now(config('app.business_timezone', 'Africa/Casablanca'))
            ->addDay()->setTime(11, 0)->format('Y-m-d H:i');
    }

    private function book(string $token, PartnerOffering $offering, array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/public/p/{$token}/reservations", array_merge([
            'offering_id' => $offering->id,
            'starts_at' => $this->slot(),
            'name' => 'Yassine',
            'phone' => '0612345678',
        ], $overrides));
    }

    // -------------------------------------------------------------- jeton

    public function test_a_partner_token_is_unique_opaque_and_never_exposes_the_partner_id(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Hotel B');

        $tokenA = $this->token($a);
        $tokenB = $this->token($b);

        $this->assertNotSame($tokenA, $tokenB);
        $this->assertSame(48, strlen($tokenA));
        // Ni l'id du partenaire, ni rien qui s'en approche.
        $this->assertStringNotContainsString((string) $a->id, $tokenA);
    }

    public function test_regenerating_revokes_the_previous_token_and_keeps_its_trace(): void
    {
        $partner = $this->partner('Hotel A');
        $old = $this->token($partner);

        $new = app(PartnerQrService::class)->issueToken($partner)->token;

        $this->assertNotSame($old, $new);
        $this->assertNotNull(PartnerQrToken::where('token', $old)->sole()->revoked_at);
        $this->assertNull(PartnerQrToken::where('token', $new)->sole()->revoked_at);
    }

    public function test_a_revoked_token_stops_showing_the_landing_and_stops_attributing(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);
        $token = $this->token($partner);

        $this->getJson("/api/public/p/{$token}")->assertOk();

        app(PartnerQrService::class)->revokeTokens($partner);

        $this->getJson("/api/public/p/{$token}")->assertNotFound();
        $this->book($token, $offering)->assertNotFound();
        $this->assertSame(0, Appointment::count());
    }

    // ------------------------------------------------------------ vitrine

    public function test_each_partner_shows_its_own_offerings_and_only_those(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $coupe = $this->bookableService('Coupe', 80);
        $hammam = $this->bookableService('Hammam turc', 150);

        $this->offerService($a, $coupe);
        $this->offerService($b, $hammam);

        $payloadA = $this->getJson('/api/public/p/'.$this->token($a))->assertOk()->json('data.offerings');
        $payloadB = $this->getJson('/api/public/p/'.$this->token($b))->assertOk()->json('data.offerings');

        $this->assertSame(['Coupe'], array_column($payloadA, 'title'));
        $this->assertSame(['Hammam turc'], array_column($payloadB, 'title'));
    }

    public function test_inactive_and_out_of_window_offerings_stay_hidden(): void
    {
        $partner = $this->partner('Hotel A');
        $visible = $this->bookableService('Coupe');
        $hidden = $this->bookableService('Barbe');
        $expired = $this->bookableService('Soin');

        $this->offerService($partner, $visible);
        $this->offerService($partner, $hidden, ['is_active' => false]);
        $this->offerService($partner, $expired, ['available_until' => now()->subDay()->toDateString()]);

        $offerings = $this->getJson('/api/public/p/'.$this->token($partner))->assertOk()->json('data.offerings');

        $this->assertSame(['Coupe'], array_column($offerings, 'title'));
    }

    public function test_a_hidden_offering_cannot_be_booked_either(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service, ['is_active' => false]);

        $this->book($this->token($partner), $offering)->assertStatus(422);
        $this->assertSame(0, Appointment::count());
    }

    public function test_a_suspended_partner_closes_its_landing_without_a_technical_error(): void
    {
        $partner = $this->partner('Hotel A', Partner::STATUS_SUSPENDED);
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);
        $token = $this->token($partner);

        $this->getJson("/api/public/p/{$token}")
            ->assertNotFound()
            ->assertJsonFragment(['message' => 'Cette offre n’est actuellement pas disponible.']);
        $this->book($token, $offering)->assertNotFound();
    }

    // -------------------------------------------------------------- packs

    public function test_a_pack_can_be_offered_to_one_partner_and_not_another(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $coupe = $this->bookableService('Coupe', 80);
        $barbe = $this->bookableService('Barbe', 50);

        $pack = ServicePack::create(['name' => 'Pack Classic', 'price' => 110, 'is_active' => true]);
        ServicePackItem::create(['service_pack_id' => $pack->id, 'service_id' => $coupe->id]);
        ServicePackItem::create(['service_pack_id' => $pack->id, 'service_id' => $barbe->id]);

        PartnerOffering::create([
            'partner_id' => $a->id,
            'kind' => PartnerOffering::KIND_PACK,
            'service_pack_id' => $pack->id,
            'is_active' => true,
        ]);
        $this->offerService($b, $coupe);

        $offeringsA = $this->getJson('/api/public/p/'.$this->token($a))->assertOk()->json('data.offerings');
        $offeringsB = $this->getJson('/api/public/p/'.$this->token($b))->assertOk()->json('data.offerings');

        $this->assertSame('Pack Classic', $offeringsA[0]['title']);
        // Le prix du pack prime sur la somme des services, et sa duree est
        // bien celle de l'ensemble.
        $this->assertEquals(110.0, $offeringsA[0]['price']);
        $this->assertSame(60, $offeringsA[0]['duration_minutes']);
        $this->assertCount(2, $offeringsA[0]['includes']);
        $this->assertSame(['Coupe'], array_column($offeringsB, 'title'));
    }

    public function test_booking_a_pack_creates_one_reservation_item_per_service_at_the_pack_price(): void
    {
        $partner = $this->partner('Hotel A');
        $coupe = $this->bookableService('Coupe', 80);
        $barbe = $this->bookableService('Barbe', 50);

        $pack = ServicePack::create(['name' => 'Pack Classic', 'price' => 110, 'is_active' => true]);
        ServicePackItem::create(['service_pack_id' => $pack->id, 'service_id' => $coupe->id]);
        ServicePackItem::create(['service_pack_id' => $pack->id, 'service_id' => $barbe->id]);

        $offering = PartnerOffering::create([
            'partner_id' => $partner->id,
            'kind' => PartnerOffering::KIND_PACK,
            'service_pack_id' => $pack->id,
            'is_active' => true,
        ]);

        $this->book($this->token($partner), $offering)->assertCreated();

        $appointment = Appointment::sole();
        $items = $appointment->reservation_items;

        $this->assertCount(2, $items);
        // La somme des prix retenus est EXACTEMENT le prix du pack.
        $this->assertEquals(110.0, round(array_sum(array_column($items, 'price_snapshot')), 2));
    }

    // -------------------------------------------------- attribution reserv.

    public function test_a_booking_through_a_qr_belongs_to_that_partner(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);

        $this->book($this->token($partner), $offering)->assertCreated();

        $appointment = Appointment::sole();
        $this->assertSame($partner->id, $appointment->partner_id);
        $this->assertSame(Appointment::SOURCE_PARTNER_QR, $appointment->source);
        $this->assertSame($offering->id, $appointment->partner_offering_id);
    }

    /**
     * LE test de securite : le corps de la requete n'a aucune prise sur
     * l'attribution. Meme en y glissant le partenaire B, c'est A — celui du
     * jeton scanne — qui recoit la reservation.
     */
    public function test_the_request_body_cannot_move_a_booking_to_another_partner(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService();
        $offering = $this->offerService($a, $service);

        $this->book($this->token($a), $offering, [
            'partner_id' => $b->id,
            'partner' => $b->id,
            'price' => 1,
        ])->assertCreated();

        $this->assertSame($a->id, Appointment::sole()->partner_id);
    }

    public function test_an_offering_of_another_partner_cannot_be_booked_through_this_qr(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService();
        $offeringOfB = $this->offerService($b, $service);

        $this->book($this->token($a), $offeringOfB)->assertStatus(422);
        $this->assertSame(0, Appointment::count());
    }

    public function test_a_new_client_is_claimed_by_the_partner_who_brought_them(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);

        $this->book($this->token($partner), $offering)->assertCreated();

        $this->assertSame($partner->id, Client::sole()->partner_id);
    }

    public function test_a_client_owned_by_another_partner_keeps_their_owner(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService();
        $offering = $this->offerService($a, $service);

        $client = Client::factory()->create([
            'phone' => '0612345678',
            'phone_e164' => '+212612345678',
            'partner_id' => $b->id,
        ]);

        $this->book($this->token($a), $offering)->assertCreated();

        // Le client reste a B, la reservation va a A.
        $this->assertSame($b->id, $client->fresh()->partner_id);
        $this->assertSame($a->id, Appointment::sole()->partner_id);
    }

    public function test_a_salon_client_without_a_partner_is_not_claimed(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);

        $client = Client::factory()->create([
            'phone' => '0612345678',
            'phone_e164' => '+212612345678',
            'partner_id' => null,
        ]);

        $this->book($this->token($partner), $offering)->assertCreated();

        $this->assertNull($client->fresh()->partner_id);
        $this->assertSame($partner->id, Appointment::sole()->partner_id);
    }

    // --------------------------------------------------------- commission

    /** Prepare une prestation payee rattachee a la reservation donnee. */
    private function payPrestation(Appointment $appointment, Service $service, float $price): Prestation
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employee = Employee::where('is_active', true)->where('is_company', false)->firstOrFail();

        Sanctum::actingAs($this->admin());

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
            'client_id' => $appointment->client_id,
        ])->assertCreated()->json('data');

        // Le lien reservation -> prestation, celui qu'ouvre la caisse quand
        // elle encaisse un rendez-vous.
        Prestation::whereKey($invoice['id'])->update(['appointment_id' => $appointment->id]);

        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
            'expected_total' => $price,
        ])->assertOk();

        return Prestation::findOrFail($invoice['id']);
    }

    public function test_a_qr_booking_pays_its_commission_to_the_scanned_partner(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService('Coupe', 80);
        $offering = $this->offerService($a, $service);

        // Le client appartient a B : c'est le QR de A qui doit l'emporter.
        Client::factory()->create([
            'phone' => '0612345678',
            'phone_e164' => '+212612345678',
            'partner_id' => $b->id,
        ]);
        PartnerServiceCommission::create([
            'partner_id' => $a->id, 'service_id' => $service->id, 'type' => 'percentage', 'value' => 10,
        ]);

        $this->book($this->token($a), $offering)->assertCreated();
        $this->payPrestation(Appointment::sole(), $service, 80);

        $commissions = PartnerCommission::all();
        $this->assertCount(1, $commissions);
        $this->assertSame($a->id, $commissions->first()->partner_id);
        $this->assertEquals(8.0, (float) $commissions->first()->amount);
    }

    public function test_an_offering_commission_overrides_the_service_grid(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService('Coupe', 80);
        $offering = $this->offerService($partner, $service, [
            'custom_commission_type' => 'percentage',
            'custom_commission_value' => 25,
        ]);

        PartnerServiceCommission::create([
            'partner_id' => $partner->id, 'service_id' => $service->id, 'type' => 'percentage', 'value' => 10,
        ]);

        $this->book($this->token($partner), $offering)->assertCreated();
        $this->payPrestation(Appointment::sole(), $service, 80);

        // 25 % de l'offre, pas 10 % de la grille.
        $this->assertEquals(20.0, (float) PartnerCommission::sole()->amount);
    }

    public function test_the_commission_is_accrued_once_even_if_accrual_runs_again(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService('Coupe', 80);
        $offering = $this->offerService($partner, $service);
        PartnerServiceCommission::create([
            'partner_id' => $partner->id, 'service_id' => $service->id, 'type' => 'percentage', 'value' => 10,
        ]);

        $this->book($this->token($partner), $offering)->assertCreated();
        $prestation = $this->payPrestation(Appointment::sole(), $service, 80);

        $before = PartnerCommission::count();
        app(\App\Services\PartnerCommissionService::class)->accrueForPrestation($prestation->fresh()->load('items'));

        $this->assertSame($before, PartnerCommission::count());
    }

    public function test_a_refund_cancels_the_qr_commission(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService('Coupe', 80);
        $offering = $this->offerService($partner, $service);
        PartnerServiceCommission::create([
            'partner_id' => $partner->id, 'service_id' => $service->id, 'type' => 'percentage', 'value' => 10,
        ]);

        $this->book($this->token($partner), $offering)->assertCreated();
        $prestation = $this->payPrestation(Appointment::sole(), $service, 80);

        $this->postJson("/api/pos-v2/invoices/{$prestation->id}/refund", ['reason' => 'Erreur'])->assertOk();

        $this->assertSame(
            PartnerCommission::STATUS_CANCELLED,
            PartnerCommission::sole()->status,
        );
    }

    /** Sans QR, la commission suit la propriete du client — comme avant. */
    public function test_a_booking_without_qr_keeps_the_historical_client_ownership_rule(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService('Coupe', 80);
        PartnerServiceCommission::create([
            'partner_id' => $partner->id, 'service_id' => $service->id, 'type' => 'percentage', 'value' => 10,
        ]);
        $client = Client::factory()->create(['partner_id' => $partner->id]);

        WorkDay::factory()->create(['status' => 'open']);
        $employee = Employee::where('is_active', true)->where('is_company', false)->firstOrFail();
        Sanctum::actingAs($this->admin());

        $invoice = $this->postJson('/api/pos-v2/invoices', [
            'items' => [['service_id' => $service->id, 'employee_id' => $employee->id]],
            'client_id' => $client->id,
        ])->assertCreated()->json('data');
        $this->postJson("/api/pos-v2/invoices/{$invoice['id']}/checkout", [
            'payment_method' => 'especes',
        ])->assertOk();

        $this->assertEquals(8.0, (float) PartnerCommission::sole()->amount);
        $this->assertSame($partner->id, PartnerCommission::sole()->partner_id);
    }

    // ----------------------------------------------------------- tracking

    public function test_a_refresh_in_the_same_session_is_not_a_second_scan(): void
    {
        $partner = $this->partner('Hotel A');
        $token = $this->token($partner);

        $this->getJson("/api/public/p/{$token}?sid=abc")->assertOk();
        $this->getJson("/api/public/p/{$token}?sid=abc")->assertOk();
        $this->getJson("/api/public/p/{$token}?sid=def")->assertOk();

        $this->assertSame(2, PartnerQrVisit::where('partner_id', $partner->id)->count());
        $this->assertSame(2, PartnerQrVisit::where('visitor_key', '!=', '')->orderBy('id')->first()->hits);
    }

    public function test_a_visit_that_books_is_linked_to_its_reservation(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService();
        $offering = $this->offerService($partner, $service);
        $token = $this->token($partner);

        $this->getJson("/api/public/p/{$token}?sid=abc")->assertOk();
        $this->book($token, $offering, ['sid' => 'abc'])->assertCreated();

        $visit = PartnerQrVisit::sole();
        $this->assertSame(Appointment::sole()->id, $visit->appointment_id);
        $this->assertNotNull($visit->converted_at);
    }

    public function test_the_stats_count_visits_bookings_and_conversion(): void
    {
        $partner = $this->partner('Hotel A');
        $service = $this->bookableService('Coupe', 80);
        $offering = $this->offerService($partner, $service);
        $token = $this->token($partner);

        $this->getJson("/api/public/p/{$token}?sid=one")->assertOk();
        $this->getJson("/api/public/p/{$token}?sid=two")->assertOk();
        $this->book($token, $offering, ['sid' => 'one'])->assertCreated();

        Sanctum::actingAs($this->admin());
        $stats = $this->getJson("/api/partners/{$partner->id}/qr/stats")->assertOk()->json('data');

        $this->assertSame(2, $stats['visits']);
        $this->assertSame(1, $stats['bookings']);
        $this->assertSame(0, $stats['confirmed_bookings']);
        $this->assertEquals(50.0, $stats['conversion_rate']);
    }

    // -------------------------------------------------------- permissions

    public function test_a_partner_only_ever_sees_its_own_qr_figures(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService();
        $offeringA = $this->offerService($a, $service);

        $this->getJson('/api/public/p/'.$this->token($a).'?sid=one')->assertOk();
        $this->book($this->token($a), $offeringA, ['sid' => 'one'])->assertCreated();

        Sanctum::actingAs($b->user);
        $payload = $this->getJson('/api/partner/qr')->assertOk()->json('data');

        // B ne voit ni la visite ni la reservation de A, et jamais le jeton
        // d'un autre : il n'y a aucun parametre pour en demander un autre.
        $this->assertSame(0, $payload['stats']['visits']);
        $this->assertSame(0, $payload['stats']['bookings']);
        $this->assertNotSame($this->token($a), $payload['token']);
        $this->assertSame([], $this->getJson('/api/partner/qr/bookings')->assertOk()->json('data'));
    }

    public function test_the_qr_administration_requires_the_partners_permission(): void
    {
        $partner = $this->partner('Hotel A');

        Sanctum::actingAs($partner->user);
        $this->getJson("/api/partners/{$partner->id}/qr/token")->assertForbidden();
        $this->postJson("/api/partners/{$partner->id}/qr/offerings", [
            'kind' => 'service',
            'service_id' => $this->bookableService()->id,
        ])->assertForbidden();
    }

    public function test_an_admin_can_compose_a_partner_showcase_without_touching_another(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $service = $this->bookableService();

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/partners/{$a->id}/qr/offerings", [
            'kind' => 'service',
            'service_id' => $service->id,
            'custom_title' => 'Coupe signature',
            'custom_price' => 120,
        ])->assertCreated();

        $this->assertSame(1, $a->offerings()->count());
        $this->assertSame(0, $b->offerings()->count());

        $offerings = $this->getJson('/api/public/p/'.$this->token($a))->json('data.offerings');
        $this->assertSame('Coupe signature', $offerings[0]['title']);
        $this->assertEquals(120.0, $offerings[0]['price']);
    }

    public function test_an_offering_cannot_be_edited_through_another_partners_url(): void
    {
        $a = $this->partner('Hotel A');
        $b = $this->partner('Salle B');
        $offering = $this->offerService($a, $this->bookableService());

        Sanctum::actingAs($this->admin());

        $this->patchJson("/api/partners/{$b->id}/qr/offerings/{$offering->id}", ['is_active' => false])
            ->assertNotFound();
        $this->assertTrue($offering->fresh()->is_active);
    }

    // --------------------------------------------------------- regression

    public function test_the_existing_public_booking_channel_is_untouched(): void
    {
        $service = $this->bookableService('Coupe', 80);

        $this->postJson('/api/public/reservations', [
            'service_id' => $service->id,
            'starts_at' => $this->slot(),
            'name' => 'Sofia',
            'phone' => '0698765432',
        ])->assertCreated();

        $appointment = Appointment::sole();
        $this->assertSame(Appointment::SOURCE_MOBILE_PUBLIC, $appointment->source);
        $this->assertNull($appointment->partner_id);
        $this->assertNull($appointment->partner_offering_id);
    }
}
