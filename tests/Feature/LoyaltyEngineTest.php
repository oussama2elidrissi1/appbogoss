<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\CommissionResolver;
use App\Services\PrestationService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyEngineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);
    }

    /** @return array{0: Employee, 1: User} */
    protected function employeeWithLogin(): array
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create([
            'user_id' => $user->id,
            'default_commission_rate' => 40,
        ]);

        return [$employee, $user];
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    protected function hammamProgram(Service $hammamService, int $threshold = 5, bool $rollover = true): LoyaltyProgram
    {
        return LoyaltyProgram::create([
            'name' => '5 Hammams = 1 Gratuit',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => [
                'category' => 'hammam',
                'threshold' => $threshold,
                'rollover_surplus' => $rollover,
                'reward_expires_after_days' => 30,
                'reward' => ['type' => 'service', 'service_id' => $hammamService->id],
            ],
            'commission_basis' => 'public_price',
        ]);
    }

    protected function payHammamPrestation(Employee $employee, User $user, User $admin, Client $client, Service $hammamService): void
    {
        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);
    }

    public function test_progress_only_advances_after_confirm_payment(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);

        $this->assertNull(LoyaltyProgramProgress::where('client_id', $client->id)->first());

        app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        $progress = LoyaltyProgramProgress::where('client_id', $client->id)->first();
        $this->assertNotNull($progress);
        $this->assertSame(1, $progress->counter);
    }

    public function test_cancelled_prestation_never_advances_progress(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->cancel($prestation, 'Client absent', $user);

        $this->assertNull(LoyaltyProgramProgress::where('client_id', $client->id)->first());
    }

    public function test_fifth_qualifying_hammam_generates_a_free_reward(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService);

        for ($i = 0; $i < 4; $i++) {
            $this->payHammamPrestation($employee, $user, $admin, $client, $hammamService);
        }

        $this->assertSame(
            4,
            LoyaltyProgramProgress::where('client_id', $client->id)->first()->counter,
        );
        $this->assertSame(0, LoyaltyReward::where('client_id', $client->id)->count());

        $this->payHammamPrestation($employee, $user, $admin, $client, $hammamService);

        $progress = LoyaltyProgramProgress::where('client_id', $client->id)->first();
        $this->assertSame(0, $progress->counter, 'Threshold crossed exactly — no surplus to roll over.');

        $reward = LoyaltyReward::where('client_id', $client->id)->first();
        $this->assertNotNull($reward);
        $this->assertSame(LoyaltyReward::STATUS_AVAILABLE, $reward->status);
        $this->assertSame($hammamService->id, $reward->service_id);
    }

    public function test_refunding_a_sale_reverses_its_loyalty_progress(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        $this->assertSame(1, LoyaltyProgramProgress::where('client_id', $client->id)->first()->counter);

        app(PrestationService::class)->refund($paid, 'Client insatisfait', $superAdmin);

        $this->assertSame(0, LoyaltyProgramProgress::where('client_id', $client->id)->first()->counter);
    }

    public function test_points_accrual_and_reversal_stay_synced_onto_the_customer_loyalty_account(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $superAdmin = User::factory()->create(['role' => 'super-admin']);
        $superAdmin->assignRole('super-admin');
        $client = Client::factory()->create();
        $service = Service::factory()->create(['category' => 'coiffure', 'price' => 100]);

        LoyaltyProgram::create([
            'name' => 'Points BOGOSLAND',
            'type' => LoyaltyProgram::TYPE_POINTS,
            'is_active' => true,
            'config' => ['points_per_mad' => 1],
            'commission_basis' => 'none',
        ]);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $service->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // The account-level balance is a mirror of the program progress, not
        // an independently-incremented field — it must reflect the accrual
        // immediately, since Phase 2's customer portal will read it directly.
        $this->assertSame(100, \App\Models\CustomerLoyaltyAccount::where('client_id', $client->id)->first()->points_balance);

        app(PrestationService::class)->refund($paid, 'Client insatisfait', $superAdmin);

        $this->assertSame(0, \App\Models\CustomerLoyaltyAccount::where('client_id', $client->id)->first()->points_balance);
    }

    public function test_reprocessing_the_same_sale_never_double_counts(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService);

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id]]],
            $employee,
            $user,
        );
        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        // Simulate a duplicate call (retry, double click) against the same
        // already-finalized Sale — the unique ledger key must make this a no-op.
        app(\App\Services\LoyaltyEngine::class)->processSale($paid->sale, $paid);

        $this->assertSame(1, LoyaltyProgramProgress::where('client_id', $client->id)->first()->counter);
    }

    public function test_eleven_purchases_with_rollover_generate_exactly_two_rewards_and_leave_one_fifth_progress(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $this->hammamProgram($hammamService, threshold: 5, rollover: true);

        for ($i = 0; $i < 11; $i++) {
            $this->payHammamPrestation($employee, $user, $admin, $client, $hammamService);
        }

        // 11 = 2 × 5 + 1 — two full thresholds crossed (2 rewards), one
        // qualifying purchase rolled over into the next cycle.
        $this->assertSame(
            2,
            LoyaltyReward::where('client_id', $client->id)->count(),
            '11 purchases against a threshold of 5 with rollover must generate exactly 2 rewards.',
        );
        $this->assertSame(
            1,
            LoyaltyProgramProgress::where('client_id', $client->id)->first()->counter,
            'The 11th purchase is the 1st toward the next reward — progress must read 1/5, not 0 or reset.',
        );
        $this->assertSame(
            2,
            LoyaltyReward::where('client_id', $client->id)->where('status', LoyaltyReward::STATUS_AVAILABLE)->count(),
        );
    }

    public function test_commission_resolves_on_public_price_for_a_free_line(): void
    {
        [$employee] = $this->employeeWithLogin();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $resolved = app(CommissionResolver::class)->resolveForFreeLine($employee, $service, 'public_price', null, 150.0);

        // 40% default commission rate applied to the public price, not the (0) charged amount.
        $this->assertEquals(60.0, $resolved['amount']);
    }

    public function test_commission_resolves_to_zero_when_basis_is_none(): void
    {
        [$employee] = $this->employeeWithLogin();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $resolved = app(CommissionResolver::class)->resolveForFreeLine($employee, $service, 'none', null, 150.0);

        $this->assertEquals(0.0, $resolved['amount']);
    }

    public function test_commission_resolves_to_fixed_override_amount(): void
    {
        [$employee] = $this->employeeWithLogin();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $resolved = app(CommissionResolver::class)->resolveForFreeLine($employee, $service, 'fixed', 20.0, 150.0);

        $this->assertEquals(20.0, $resolved['amount']);
    }

    public function test_commission_resolves_to_percent_of_public_price(): void
    {
        [$employee] = $this->employeeWithLogin();
        $service = Service::factory()->create(['category' => 'hammam', 'price' => 150]);

        $resolved = app(CommissionResolver::class)->resolveForFreeLine($employee, $service, 'percent', 10.0, 150.0);

        $this->assertEquals(15.0, $resolved['amount']);
    }

    public function test_free_hammam_confirmed_at_the_caisse_carries_the_configured_commission(): void
    {
        [$employee, $user] = $this->employeeWithLogin();
        $admin = $this->admin();
        $client = Client::factory()->create();
        $hammamService = Service::factory()->create(['category' => 'hammam', 'price' => 150]);
        $program = $this->hammamProgram($hammamService);

        for ($i = 0; $i < 5; $i++) {
            $this->payHammamPrestation($employee, $user, $admin, $client, $hammamService);
        }

        $reward = LoyaltyReward::where('client_id', $client->id)->firstOrFail();

        $prestation = app(PrestationService::class)->create(
            ['client_id' => $client->id, 'items' => [['service_id' => $hammamService->id, 'loyalty_reward_id' => $reward->id]]],
            $employee,
            $user,
        );

        $item = $prestation->fresh('items')->items->first();
        $this->assertTrue((bool) $item->is_free);
        $this->assertEquals(0, $item->unit_price);

        app(PrestationService::class)->markServicesDone($prestation, $user);
        app(PrestationService::class)->sendToCaisse($prestation, $user);
        $paid = app(PrestationService::class)->confirmPayment($prestation, ['payment_method' => 'especes'], $admin);

        $paidItem = $paid->items->first();
        // 40% default rate applied to the 150 MAD public price of the free hammam.
        $this->assertEquals(60, $paidItem->commission_amount);
        $this->assertSame(LoyaltyReward::STATUS_USED, $reward->fresh()->status);
    }
}
