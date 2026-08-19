<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\PartnerCommissionService;
use App\Services\PrestationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The real partner commission ledger: accrual at payment confirmation
 * (client-ownership driven, not booking-driven — see PartnerCommissionService
 * docblock), cancellation on refund, and the admin payout flow (§20/§21).
 */
class PartnerCommissionLedgerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    private function makePartner(string $email = 'partner@test.com'): Partner
    {
        $user = User::factory()->create(['email' => $email, 'role' => 'partner']);
        $user->assignRole('partner');

        return Partner::create(['name' => 'Riad Test', 'is_active' => true, 'user_id' => $user->id]);
    }

    /** Builds and pays a one-line Prestation for the given client, returns it. */
    private function payPrestationFor(Client $client, Service $service, User $admin, float $price = 100): Prestation
    {
        WorkDay::factory()->create(['status' => 'open']);
        $employee = Employee::factory()->create();

        Sanctum::actingAs($admin);
        $prestationService = app(PrestationService::class);

        $prestation = $prestationService->create(['client_id' => $client->id], $employee, $admin);
        $prestationService->addItem($prestation, ['service_id' => $service->id, 'unit_price' => $price], $admin);
        $prestationService->markServicesDone($prestation, $admin);
        $prestationService->sendToCaisse($prestation, $admin, false);

        return $prestationService->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);
    }

    public function test_paying_a_partner_owned_clients_prestation_accrues_validated_commission(): void
    {
        $admin = $this->admin();
        $partner = $this->makePartner();
        $service = Service::factory()->create(['price' => 100]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'percentage', 'value' => 10]);
        $client = Client::factory()->create(['partner_id' => $partner->id]);

        $prestation = $this->payPrestationFor($client, $service, $admin, 100);

        $this->assertDatabaseHas('partner_commissions', [
            'partner_id' => $partner->id,
            'client_id' => $client->id,
            'prestation_id' => $prestation->id,
            'status' => PartnerCommission::STATUS_VALIDATED,
            'base_amount' => 100,
            'amount' => 10,
        ]);
    }

    public function test_prestation_for_bogosland_client_accrues_no_partner_commission(): void
    {
        $admin = $this->admin();
        $service = Service::factory()->create(['price' => 100]);
        $client = Client::factory()->create(['partner_id' => null]);

        $this->payPrestationFor($client, $service, $admin, 100);

        $this->assertSame(0, PartnerCommission::count());
    }

    public function test_partner_client_prestation_with_no_configured_rate_still_tracks_revenue_at_zero_commission(): void
    {
        $admin = $this->admin();
        $partner = $this->makePartner();
        $service = Service::factory()->create(['price' => 80]);
        // Deliberately no PartnerServiceCommission rule for this service.
        $client = Client::factory()->create(['partner_id' => $partner->id]);

        $this->payPrestationFor($client, $service, $admin, 80);

        $this->assertDatabaseHas('partner_commissions', [
            'partner_id' => $partner->id,
            'base_amount' => 80,
            'amount' => 0,
            'status' => PartnerCommission::STATUS_VALIDATED,
        ]);
    }

    public function test_refunding_a_paid_prestation_cancels_its_partner_commission(): void
    {
        $admin = $this->admin();
        $partner = $this->makePartner();
        $service = Service::factory()->create(['price' => 100]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'fixed', 'value' => 15]);
        $client = Client::factory()->create(['partner_id' => $partner->id]);

        $prestation = $this->payPrestationFor($client, $service, $admin, 100);

        app(PrestationService::class)->refund($prestation, 'Client insatisfait', $admin);

        $this->assertDatabaseHas('partner_commissions', [
            'prestation_id' => $prestation->id,
            'status' => PartnerCommission::STATUS_CANCELLED,
        ]);
    }

    public function test_paying_settles_selected_validated_commissions_and_records_a_payout(): void
    {
        $admin = $this->admin();
        $partner = $this->makePartner();
        $service = Service::factory()->create(['price' => 100]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'fixed', 'value' => 20]);
        $clientA = Client::factory()->create(['partner_id' => $partner->id]);
        $clientB = Client::factory()->create(['partner_id' => $partner->id]);

        $this->payPrestationFor($clientA, $service, $admin, 100);
        $this->payPrestationFor($clientB, $service, $admin, 100);

        $commissionIds = PartnerCommission::where('partner_id', $partner->id)->pluck('id')->all();
        $this->assertCount(2, $commissionIds);

        $payout = app(PartnerCommissionService::class)->pay(
            $partner,
            $commissionIds,
            $admin,
            'virement',
            'REF-001',
            'Paiement mensuel',
        );

        $this->assertSame(40.0, (float) $payout->amount);
        $this->assertSame(2, $payout->commissions()->count());
        $this->assertDatabaseCount('partner_commissions', 2);
        foreach ($commissionIds as $id) {
            $this->assertDatabaseHas('partner_commissions', [
                'id' => $id,
                'status' => PartnerCommission::STATUS_PAID,
                'partner_commission_payout_id' => $payout->id,
            ]);
        }
    }

    public function test_paying_twice_the_same_commission_is_refused(): void
    {
        $admin = $this->admin();
        $partner = $this->makePartner();
        $service = Service::factory()->create(['price' => 100]);
        $partner->commissions()->create(['service_id' => $service->id, 'type' => 'fixed', 'value' => 20]);
        $client = Client::factory()->create(['partner_id' => $partner->id]);
        $this->payPrestationFor($client, $service, $admin, 100);

        $service2 = app(PartnerCommissionService::class);
        $id = PartnerCommission::where('partner_id', $partner->id)->value('id');
        $service2->pay($partner, [$id], $admin);

        $this->expectException(ValidationException::class);
        $service2->pay($partner, [$id], $admin);
    }
}
