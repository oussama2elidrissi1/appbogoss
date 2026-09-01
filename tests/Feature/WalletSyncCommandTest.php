<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Sale;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `wallet:sync-closed-days` — le rattrapage des journées clôturées muettes.
 *
 * Le crédit d'une journée se fait à sa clôture ; une journée fermée avant que
 * ce mécanisme n'existe dans un déploiement reste donc jamais créditée, et
 * rien ne repasse derrière. Cette commande est ce « derrière », et ces tests
 * vérifient qu'elle n'est QUE cela : idempotente, bornée à la date de
 * démarrage, fidèle au rapport figé.
 */
class WalletSyncCommandTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-20 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->travelTo(self::NOW);
        config(['wallet.start_date' => '2026-09-01']);
    }

    private function admin(): User
    {
        $user = User::factory()->create(['name' => 'Admin BOGOSLAND', 'role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create(['name' => 'Super Admin', 'role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    /**
     * Une journée clôturée SANS passer par closeDay() — exactement l'état que
     * laisse une clôture faite sous l'ancien code : le rapport figé est là,
     * aucun mouvement de portefeuille ne l'accompagne.
     */
    private function closedDayWithoutCredit(User $owner, string $date, float $net): WorkDay
    {
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => $date,
            'opened_by_user_id' => $owner->id,
            'opening_balance' => 0,
            'status' => 'closed',
            'closed_at' => $date.' 22:00:00',
            'closing_report' => ['net_result' => $net, 'revenue_total' => $net],
        ]);

        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $net,
            'payment_method' => 'especes',
        ]);

        return $day;
    }

    private function walletOf(User $user): ?Wallet
    {
        return Wallet::where('user_id', $user->id)->first();
    }

    public function test_it_credits_a_closed_day_that_was_never_credited(): void
    {
        $admin = $this->admin();
        $this->closedDayWithoutCredit($admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days')
            ->expectsOutputToContain('01/09/2026')
            ->expectsOutputToContain('1 journée(s) créditée(s).')
            ->assertSuccessful();

        $this->assertSame('1548.00', (string) $this->walletOf($admin)->balance);

        $movement = WalletTransaction::firstOrFail();
        $this->assertSame(WalletTransaction::TYPE_CASH_REGISTER_RESULT, $movement->type);
        // Le mouvement porte la date de la journée, pas celle du rattrapage.
        $this->assertSame('2026-09-01', $movement->occurred_at->toDateString());
    }

    public function test_it_never_credits_twice_and_never_touches_august(): void
    {
        $admin = $this->admin();
        $this->closedDayWithoutCredit($admin, '2026-08-28', 3468);
        $this->closedDayWithoutCredit($admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days')->assertSuccessful();
        // Une deuxième passe ne doit rien ajouter — c'est toute la différence
        // entre un rattrapage et un backfill.
        $this->artisan('wallet:sync-closed-days')
            ->expectsOutputToContain('déjà créditée')
            ->expectsOutputToContain('0 journée(s) créditée(s).')
            ->assertSuccessful();

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame('1548.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_dry_run_shows_everything_and_writes_nothing(): void
    {
        $admin = $this->admin();
        $this->closedDayWithoutCredit($admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days --dry-run')
            ->expectsOutputToContain('créditerait')
            ->expectsOutputToContain('Relancez sans --dry-run')
            ->assertSuccessful();

        $this->assertSame(0, WalletTransaction::count());
        $this->assertNull($this->walletOf($admin));
    }

    public function test_a_day_closed_through_the_normal_flow_is_left_alone(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => '2026-09-02',
            'opened_by_user_id' => $admin->id,
            'opening_balance' => 0,
            'status' => 'open',
        ]);
        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 600,
            'payment_method' => 'especes',
        ]);
        \Laravel\Sanctum\Sanctum::actingAs($admin);
        app(\App\Services\WorkDayService::class)->closeDay($day->fresh());

        $this->assertSame(1, WalletTransaction::count());

        $this->artisan('wallet:sync-closed-days')
            ->expectsOutputToContain('déjà créditée')
            ->assertSuccessful();

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame('600.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_a_day_without_an_owner_is_reported_not_guessed(): void
    {
        $admin = $this->admin();
        $day = $this->closedDayWithoutCredit($admin, '2026-09-03', 500);
        $day->update(['opened_by_user_id' => null]);

        $this->artisan('wallet:sync-closed-days')
            ->expectsOutputToContain('aucun responsable')
            ->expectsOutputToContain('0 journée(s) créditée(s).')
            ->assertSuccessful();

        $this->assertSame(0, WalletTransaction::count());
    }

    // =====================================================================
    // À qui va le résultat d'une journée
    // =====================================================================

    /**
     * Le cas signalé en production : la journée avait été OUVERTE avec le
     * compte Super Admin, et le résultat a atterri dans le portefeuille du
     * patron. Le résultat d'une caisse va à l'admin qui tient le tiroir — le
     * patron, lui, reçoit par transfert.
     */
    public function test_a_day_opened_by_the_owner_but_closed_by_an_admin_credits_the_admin(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => '2026-09-01',
            'opened_by_user_id' => $superAdmin->id,
            'opening_balance' => 0,
            'status' => 'open',
        ]);
        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 1548,
            'payment_method' => 'especes',
        ]);

        \Laravel\Sanctum\Sanctum::actingAs($admin);
        app(\App\Services\WorkDayService::class)->closeDay($day->fresh());

        $this->assertSame('1548.00', (string) $this->walletOf($admin)->balance);
        $this->assertNull($this->walletOf($superAdmin));
    }

    /** Journée entièrement tenue par le patron : son portefeuille est le bon. */
    public function test_a_day_fully_run_by_the_owner_credits_the_owner(): void
    {
        $superAdmin = $this->superAdmin();
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => '2026-09-01',
            'opened_by_user_id' => $superAdmin->id,
            'opening_balance' => 0,
            'status' => 'open',
        ]);
        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => 900,
            'payment_method' => 'especes',
        ]);

        \Laravel\Sanctum\Sanctum::actingAs($superAdmin);
        app(\App\Services\WorkDayService::class)->closeDay($day->fresh());

        $this->assertSame('900.00', (string) $this->walletOf($superAdmin)->balance);
    }

    // =====================================================================
    // --repair-owners : réattribuer un crédit tombé chez le patron
    // =====================================================================

    /**
     * Reconstruit l'état laissé par l'ancienne règle : le crédit du 01/09 est
     * dans le portefeuille du patron alors que l'admin a clôturé la journée.
     */
    private function misplacedCredit(User $superAdmin, User $admin, float $amount = 1548): WorkDay
    {
        $day = $this->closedDayWithoutCredit($superAdmin, '2026-09-01', $amount);

        $wallet = app(\App\Services\WalletService::class)->walletFor($superAdmin);
        $wallet->forceFill(['balance' => number_format($amount, 2, '.', '')])->save();

        WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'type' => WalletTransaction::TYPE_CASH_REGISTER_RESULT,
            'direction' => WalletTransaction::DIRECTION_IN,
            'bucket' => WalletTransaction::BUCKET_AVAILABLE,
            'amount' => $amount,
            'balance_after' => $amount,
            'cash_fund_after' => 0,
            'performed_by_user_id' => $admin->id,
            'source_type' => $day->getMorphClass(),
            'source_id' => $day->id,
            'description' => 'Resultat de la caisse du 01/09/2026',
            'occurred_at' => '2026-09-01 00:00:00',
        ]);

        return $day;
    }

    public function test_repair_owners_moves_the_credit_to_the_admin_without_deleting_anything(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->misplacedCredit($superAdmin, $admin);

        $this->artisan('wallet:sync-closed-days --repair-owners')
            ->expectsOutputToContain('1 548,00 DH déplacés de Super Admin vers Admin BOGOSLAND')
            ->expectsOutputToContain('1 crédit(s) réattribué(s).')
            ->assertSuccessful();

        // Le patron rend, l'admin recoit, et RIEN n'a ete supprime : le
        // credit fautif, sa contre-passe et la reattribution sont tous la.
        $this->assertSame('0.00', (string) $this->walletOf($superAdmin)->balance);
        $this->assertSame('1548.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(3, WalletTransaction::count());

        $service = app(\App\Services\WalletService::class);
        $this->assertTrue($service->reconcile($this->walletOf($superAdmin))['balanced']);
        $this->assertTrue($service->reconcile($this->walletOf($admin))['balanced']);

        // Une deuxieme passe ne touche plus a rien.
        $this->artisan('wallet:sync-closed-days --repair-owners')
            ->expectsOutputToContain('déjà contre-passé')
            ->expectsOutputToContain('0 crédit(s) réattribué(s).')
            ->assertSuccessful();
        $this->assertSame(3, WalletTransaction::count());
    }

    public function test_repair_owners_dry_run_writes_nothing(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->misplacedCredit($superAdmin, $admin);

        $this->artisan('wallet:sync-closed-days --repair-owners --dry-run')
            ->expectsOutputToContain('déplacerait')
            ->assertSuccessful();

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame('1548.00', (string) $this->walletOf($superAdmin)->balance);
    }

    public function test_repair_owners_leaves_a_credit_that_belongs_to_the_owner(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $day = $this->misplacedCredit($superAdmin, $admin);

        // Le patron a aussi cloture : personne d'autre n'a tenu la caisse.
        WalletTransaction::where('source_id', $day->id)
            ->update(['performed_by_user_id' => $superAdmin->id]);
        $day->update(['opened_by_user_id' => $superAdmin->id]);

        $this->artisan('wallet:sync-closed-days --repair-owners')
            ->expectsOutputToContain('entièrement tenue par le patron')
            ->expectsOutputToContain('0 crédit(s) réattribué(s).')
            ->assertSuccessful();

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame('1548.00', (string) $this->walletOf($superAdmin)->balance);
    }
}
