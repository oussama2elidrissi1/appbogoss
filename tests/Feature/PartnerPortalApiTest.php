<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\Prestation;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * End-to-end coverage of the partner portal's own API surface (dashboard,
 * services, clients, commissions, profile) with two partners — locks in
 * §22's isolation guarantees for every new endpoint, not just /clients.
 */
class PartnerPortalApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makePartner(string $email, string $name): Partner
    {
        $user = User::factory()->create(['email' => $email, 'role' => 'partner']);
        $user->assignRole('partner');

        return Partner::create(['name' => $name, 'is_active' => true, 'user_id' => $user->id]);
    }

    public function test_non_partner_account_is_forbidden_from_every_portal_endpoint(): void
    {
        $employee = User::factory()->create(['role' => 'employee']);
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $this->getJson('/api/partner/dashboard')->assertForbidden();
        $this->getJson('/api/partner/services')->assertForbidden();
        $this->getJson('/api/partner/clients')->assertForbidden();
        $this->getJson('/api/partner/commissions')->assertForbidden();
        $this->getJson('/api/partner/profile')->assertForbidden();
    }

    public function test_dashboard_reports_real_counts_not_hardcoded(): void
    {
        $partner = $this->makePartner('a@partner.test', 'Partenaire A');
        $service = Service::factory()->create(['price' => 200]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'percentage', 'value' => 10]);

        Appointment::factory()->create([
            'partner_id' => $partner->id,
            'service_id' => $service->id,
            'status' => 'confirmed',
            'reservation_items' => [['service_id' => $service->id, 'employee_id' => null]],
            'starts_at' => now()->startOfMonth()->addDays(2),
            'ends_at' => now()->startOfMonth()->addDays(2)->addMinutes(30),
        ]);
        Appointment::factory()->create([
            'partner_id' => $partner->id,
            'service_id' => $service->id,
            'status' => 'pending',
            'reservation_items' => [['service_id' => $service->id, 'employee_id' => null]],
            'starts_at' => now()->startOfMonth()->addDays(3),
            'ends_at' => now()->startOfMonth()->addDays(3)->addMinutes(30),
        ]);

        Sanctum::actingAs($partner->user);
        $response = $this->getJson('/api/partner/dashboard')->assertOk()->json('data');

        $this->assertSame(2, $response['reservations_month']);
        $this->assertSame(1, $response['reservations_confirmed']);
        // 10% of 200 twice (one confirmed, one pending — both still "estimated").
        $this->assertEquals(40.0, $response['commission_estimated']);
    }

    public function test_dashboard_surfaces_upcoming_reservations_and_recent_activity(): void
    {
        $partner = $this->makePartner('a@partner.test', 'Partenaire A');
        $service = Service::factory()->create(['price' => 100]);
        $client = Client::factory()->create(['partner_id' => $partner->id, 'name' => 'Amina']);

        Sanctum::actingAs($partner->user);

        $created = $this->postJson('/api/appointments', [
            'client_id' => $client->id,
            'service_id' => $service->id,
            'starts_at' => now()->addDays(3)->toDateTimeString(),
        ])->assertCreated()->json('data');

        $response = $this->getJson('/api/partner/dashboard')->assertOk()->json('data');

        $this->assertCount(1, $response['upcoming_reservations']);
        $this->assertSame($created['id'], $response['upcoming_reservations'][0]['id']);
        $this->assertSame('Amina', $response['upcoming_reservations'][0]['client_name']);

        $labels = array_column($response['recent_activity'], 'label');
        $this->assertContains('Réservation RSV-'.$created['id'].' créée', $labels);
        $this->assertContains('Amina ajouté(e) comme client', $labels);
    }

    public function test_services_only_lists_services_this_partner_has_a_commission_rule_for(): void
    {
        $partner = $this->makePartner('a@partner.test', 'Partenaire A');
        $allowed = Service::factory()->create(['name' => 'Hammam Royal', 'is_active' => true]);
        Service::factory()->create(['name' => 'Service non autorisé', 'is_active' => true]);
        $partner->commissions()->create(['service_id' => $allowed->id, 'type' => 'percentage', 'value' => 15]);

        Sanctum::actingAs($partner->user);
        $response = $this->getJson('/api/partner/services')->assertOk()->json('data');

        $this->assertCount(1, $response);
        $this->assertSame('Hammam Royal', $response[0]['name']);
    }

    public function test_partner_client_list_and_detail_are_isolated_between_two_partners(): void
    {
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        $partnerB = $this->makePartner('b@partner.test', 'Partenaire B');
        $clientA = Client::factory()->create(['partner_id' => $partnerA->id, 'name' => 'Client A']);
        Client::factory()->create(['partner_id' => $partnerB->id, 'name' => 'Client B']);

        Sanctum::actingAs($partnerA->user);

        $list = $this->getJson('/api/partner/clients')->assertOk()->json('data');
        $this->assertCount(1, $list);
        $this->assertSame('Client A', $list[0]['name']);

        $this->getJson('/api/partner/clients/'.$clientA->id)->assertOk();

        $otherClient = Client::where('partner_id', $partnerB->id)->firstOrFail();
        $this->getJson('/api/partner/clients/'.$otherClient->id)->assertForbidden();
    }

    public function test_partner_can_archive_and_unarchive_their_own_client(): void
    {
        $partner = $this->makePartner('a@partner.test', 'Partenaire A');
        $client = Client::factory()->create(['partner_id' => $partner->id, 'name' => 'Client A']);
        Sanctum::actingAs($partner->user);

        $this->getJson('/api/partner/clients')->assertOk()->assertJsonCount(1, 'data');

        $this->patchJson('/api/partner/clients/'.$client->id.'/archive')
            ->assertOk()
            ->assertJsonPath('data.archived_at', fn ($value) => $value !== null);

        $this->getJson('/api/partner/clients')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/partner/clients?filter=archived')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/partner/clients?filter=all')->assertOk()->assertJsonCount(1, 'data');

        $this->patchJson('/api/partner/clients/'.$client->id.'/unarchive')
            ->assertOk()
            ->assertJsonPath('data.archived_at', null);

        $this->getJson('/api/partner/clients')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_partner_cannot_archive_another_partners_client(): void
    {
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        $partnerB = $this->makePartner('b@partner.test', 'Partenaire B');
        $clientB = Client::factory()->create(['partner_id' => $partnerB->id]);

        Sanctum::actingAs($partnerA->user);
        $this->patchJson('/api/partner/clients/'.$clientB->id.'/archive')->assertForbidden();
    }

    public function test_partner_commissions_and_summary_are_isolated_between_two_partners(): void
    {
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        $partnerB = $this->makePartner('b@partner.test', 'Partenaire B');

        PartnerCommission::create([
            'partner_id' => $partnerA->id,
            'client_id' => Client::factory()->create(['partner_id' => $partnerA->id])->id,
            'prestation_id' => $this->makePrestation()->id,
            'base_amount' => 100,
            'amount' => 10,
            'status' => PartnerCommission::STATUS_VALIDATED,
        ]);
        PartnerCommission::create([
            'partner_id' => $partnerB->id,
            'client_id' => Client::factory()->create(['partner_id' => $partnerB->id])->id,
            'prestation_id' => $this->makePrestation()->id,
            'base_amount' => 500,
            'amount' => 50,
            'status' => PartnerCommission::STATUS_VALIDATED,
        ]);

        Sanctum::actingAs($partnerA->user);
        $response = $this->getJson('/api/partner/commissions')->assertOk()->json();

        $this->assertCount(1, $response['data']);
        $this->assertEquals(10.0, $response['meta']['validated_total']);
    }

    private function makePrestation(): Prestation
    {
        $employee = Employee::factory()->create();
        $creator = User::factory()->create(['role' => 'admin']);

        return Prestation::create([
            'reference' => 'PRE-TEST-'.uniqid(),
            'employee_id' => $employee->id,
            'created_by_user_id' => $creator->id,
            'status' => Prestation::STATUS_PAID,
        ]);
    }

    public function test_partner_cannot_update_or_pay_another_partners_commissions_via_admin_endpoint(): void
    {
        // Even with admin-side access, paying partner B's commissions must
        // require targeting partner B specifically — a partner account itself
        // has no access to this admin endpoint at all.
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        Sanctum::actingAs($partnerA->user);

        $this->getJson('/api/partner-commissions')->assertForbidden();
        $this->postJson('/api/partner-commission-payouts', ['partner_id' => $partnerA->id])->assertForbidden();
    }

    public function test_partner_profile_is_scoped_to_self_and_can_be_updated(): void
    {
        $partnerA = $this->makePartner('a@partner.test', 'Partenaire A');
        $partnerB = $this->makePartner('b@partner.test', 'Partenaire B');

        Sanctum::actingAs($partnerA->user);

        $this->getJson('/api/partner/profile')->assertOk()->assertJsonPath('data.name', 'Partenaire A');

        $this->patchJson('/api/partner/profile', [
            'trade_name' => 'Riad Al Fassia',
            'city' => 'Fès',
            'payment_iban' => 'MA00 0000 0000 0000 0000 0000',
        ])->assertOk()
            ->assertJsonPath('data.trade_name', 'Riad Al Fassia')
            ->assertJsonPath('data.city', 'Fès');

        $partnerB->refresh();
        $this->assertNull($partnerB->trade_name);
    }

    public function test_partner_status_gates_dashboard_access_only_via_login_not_data(): void
    {
        // A suspended partner can still view their own dashboard/history —
        // only booking creation is blocked (already covered by PartnerApiTest).
        $partner = $this->makePartner('a@partner.test', 'Partenaire A');
        $partner->update(['status' => Partner::STATUS_SUSPENDED]);

        Sanctum::actingAs($partner->user);

        $this->getJson('/api/partner/dashboard')->assertOk()->assertJsonPath('data.status', 'suspended');
    }
}
