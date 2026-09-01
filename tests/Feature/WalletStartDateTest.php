<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Sale;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WorkDay;
use App\Services\WalletService;
use App\Services\WorkDayService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * La frontière du 1er septembre 2026.
 *
 * Le portefeuille est un NOUVEAU point de départ financier : il démarre à zéro
 * et n'absorbe rien du passé. Juillet et août restent entiers dans les rapports
 * — cette suite vérifie qu'ils y restent purement informatifs, quoi qu'on fasse
 * ensuite avec ces journées-là.
 *
 * Elle vérifie aussi ce qui n'est PAS une frontière : le changement de mois. Un
 * solde de septembre se retrouve intact le 1er octobre, parce que rien nulle
 * part ne remet un portefeuille à zéro.
 */
class WalletStartDateTest extends TestCase
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
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    /** Une journée ouverte par cet admin, avec une recette et donc un résultat. */
    private function dayWithResult(string $date, float $revenue, User $owner): WorkDay
    {
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => $date,
            'opened_by_user_id' => $owner->id,
            'opening_balance' => 0,
            'status' => 'open',
        ]);

        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client de passage',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $revenue,
            'payment_method' => 'especes',
        ]);

        return $day;
    }

    private function close(WorkDay $day, User $actor): WorkDay
    {
        Sanctum::actingAs($actor);

        return app(WorkDayService::class)->closeDay($day->fresh());
    }

    private function walletOf(User $user): ?Wallet
    {
        return Wallet::where('user_id', $user->id)->first();
    }

    // -------------------------------------------------------------------
    // Avant la date de démarrage : rien n'entre
    // -------------------------------------------------------------------

    public function test_closing_the_day_before_the_start_date_credits_nothing(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-08-31', 2500, $admin);

        $this->close($day, $admin);

        $this->assertSame(0, WalletTransaction::count());
        // Aucun portefeuille n'est même créé : il n'y avait rien à y écrire.
        $this->assertNull($this->walletOf($admin));
    }

    public function test_reclosing_an_august_day_after_installation_credits_nothing(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-08-15', 1900, $admin);

        // Première clôture (hors périmètre), puis on force la journée à
        // rouvrir en base pour simuler exactement ce que craint la consigne :
        // une journée d'août re-traitée après l'installation du portefeuille.
        $this->close($day, $admin);
        $day->fresh()->update(['status' => 'open', 'closed_at' => null]);

        $this->close($day, $admin);

        $this->assertSame(0, WalletTransaction::count());
        $this->assertSame('closed', $day->fresh()->status);
    }

    public function test_a_july_day_stays_out_of_the_wallet_but_keeps_its_report(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-07-10', 3300, $admin);

        $closed = $this->close($day, $admin);

        $this->assertSame(0, WalletTransaction::count());
        // Le rapport historique, lui, est intact : c'est tout l'objet de la
        // règle « informatif mais sans impact ».
        $this->assertSame(3300.0, round((float) $closed->closing_report['net_result'], 2));
    }

    // -------------------------------------------------------------------
    // À partir de la date de démarrage : le portefeuille compte
    // -------------------------------------------------------------------

    public function test_closing_the_start_date_itself_credits_the_wallet(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-09-01', 3500, $admin);

        $this->close($day, $admin);

        $wallet = $this->walletOf($admin);
        $this->assertNotNull($wallet);
        $this->assertSame('3500.00', (string) $wallet->balance);
        $this->assertSame(1, WalletTransaction::count());

        $movement = WalletTransaction::first();
        $this->assertSame(WalletTransaction::TYPE_CASH_REGISTER_RESULT, $movement->type);
        $this->assertSame(WalletTransaction::DIRECTION_IN, $movement->direction);
        $this->assertSame($day->id, (int) $movement->source_id);
    }

    public function test_closing_the_day_after_the_start_date_credits_the_wallet(): void
    {
        $admin = $this->admin();

        $this->close($this->dayWithResult('2026-09-01', 3500, $admin), $admin);
        $this->close($this->dayWithResult('2026-09-02', 1200, $admin), $admin);

        $this->assertSame('4700.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(2, WalletTransaction::count());
    }

    public function test_august_and_september_days_closed_together_credit_only_september(): void
    {
        $admin = $this->admin();

        $this->close($this->dayWithResult('2026-08-30', 9000, $admin), $admin);
        $this->close($this->dayWithResult('2026-08-31', 8000, $admin), $admin);
        $this->close($this->dayWithResult('2026-09-01', 3500, $admin), $admin);

        $this->assertSame('3500.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(1, WalletTransaction::count());
    }

    // -------------------------------------------------------------------
    // Pas de double crédit
    // -------------------------------------------------------------------

    public function test_a_day_can_never_credit_the_wallet_twice(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-09-05', 2548, $admin);

        $this->close($day, $admin);

        // On rouvre la journée en base et on la re-clôture : le second passage
        // ne doit rien écrire de plus. C'est le scénario qui, sans l'index
        // unique, doublerait silencieusement l'argent de l'admin.
        $day->fresh()->update(['status' => 'open', 'closed_at' => null]);
        $this->close($day, $admin);

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame('2548.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_calling_the_credit_twice_directly_is_idempotent(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-09-06', 1763, $admin);
        $this->close($day, $admin);

        $wallets = app(WalletService::class);
        $again = $wallets->creditWorkDayResult($day->fresh(), 1763.0, $admin);

        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame(WalletTransaction::TYPE_CASH_REGISTER_RESULT, $again->type);
        $this->assertSame('1763.00', (string) $this->walletOf($admin)->balance);
    }

    // -------------------------------------------------------------------
    // Le mois n'est pas une frontière
    // -------------------------------------------------------------------

    public function test_the_balance_carries_over_from_september_to_october(): void
    {
        $admin = $this->admin();

        $this->close($this->dayWithResult('2026-09-29', 500, $admin), $admin);
        $this->close($this->dayWithResult('2026-09-30', 300, $admin), $admin);

        $this->assertSame('800.00', (string) $this->walletOf($admin)->balance);

        // On passe en octobre. Rien ne tourne à minuit, rien ne se remet à
        // zéro : le solde est simplement toujours là.
        $this->travelTo('2026-10-01 09:00:00');

        $this->assertSame('800.00', (string) $this->walletOf($admin)->balance);

        $this->close($this->dayWithResult('2026-10-01', 1200, $admin), $admin);

        $this->assertSame('2000.00', (string) $this->walletOf($admin)->balance);
    }

    // -------------------------------------------------------------------
    // Cas limites du crédit automatique
    // -------------------------------------------------------------------

    public function test_a_zero_result_writes_no_movement(): void
    {
        $admin = $this->admin();
        $day = WorkDay::factory()->create([
            'date' => '2026-09-07',
            'opened_by_user_id' => $admin->id,
            'opening_balance' => 400,
            'status' => 'open',
        ]);

        $this->close($day, $admin);

        // Le fond de caisse du jour n'est PAS un résultat : l'ignorer ici est
        // ce qui empêche de le compter deux fois.
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_a_negative_result_is_recorded_as_a_debit(): void
    {
        $admin = $this->admin();
        $day = $this->dayWithResult('2026-09-08', 100, $admin);

        \App\Models\Expense::create([
            'work_day_id' => $day->id,
            'label' => 'Fournitures',
            'category' => 'general',
            'amount' => 400,
            'spent_on' => '2026-09-08',
        ]);

        $this->close($day, $admin);

        $wallet = $this->walletOf($admin);
        $this->assertSame('-300.00', (string) $wallet->balance);
        $this->assertSame(WalletTransaction::DIRECTION_OUT, WalletTransaction::first()->direction);
    }
}
