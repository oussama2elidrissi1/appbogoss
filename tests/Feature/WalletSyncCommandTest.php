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
}
