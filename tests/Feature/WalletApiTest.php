<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Expense;
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
 * Le portefeuille de bout en bout : API, droits, atomicité, et les deux
 * scénarios réels que le système doit désormais calculer tout seul.
 *
 * Toute la suite se place en septembre 2026, après le démarrage du
 * portefeuille — la frontière du 1er septembre a sa propre suite
 * (WalletStartDateTest).
 */
class WalletApiTest extends TestCase
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

    private function admin(string $name = 'Admin Caisse'): User
    {
        $user = User::factory()->create(['name' => $name, 'role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create(['name' => 'Patron', 'role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    private function employeeUser(): User
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        return $user;
    }

    private function closeDayWithResult(string $date, float $revenue, User $owner): WorkDay
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

        Sanctum::actingAs($owner);

        return app(WorkDayService::class)->closeDay($day->fresh());
    }

    private function walletOf(User $user): Wallet
    {
        return app(WalletService::class)->walletFor($user);
    }

    /**
     * Un montant lu dans une reponse JSON.
     *
     * `json_encode` serialise 2548.00 en `2548`, donc en entier : comparer
     * strictement a 2548.0 echouerait sur le type, pas sur la valeur. Ce
     * helper ramene tout au meme terrain, avec la precision du centime.
     */
    private function money(mixed $value): float
    {
        return round((float) $value, 2);
    }

    // =====================================================================
    // Droits d'accès
    // =====================================================================

    public function test_an_admin_sees_their_own_wallet(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 2548, $admin);

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/wallet');

        $response->assertOk()
            ->assertJsonPath('data.balance', fn ($value) => $this->money($value) === 2548.0)
            ->assertJsonPath('data.type', 'admin')
            ->assertJsonPath('data.cash_registers_total', fn ($value) => $this->money($value) === 2548.0)
            ->assertJsonPath('data.start_date', '2026-09-01')
            ->assertJsonPath('data.reconciliation.balanced', true);
    }

    public function test_an_employee_cannot_reach_the_wallet(): void
    {
        Sanctum::actingAs($this->employeeUser());

        $this->getJson('/api/wallet')->assertForbidden();
        $this->postJson('/api/wallet/transfers', ['amount' => 10])->assertForbidden();
    }

    public function test_an_admin_cannot_read_the_global_view_nor_adjust(): void
    {
        $admin = $this->admin();
        $wallet = $this->walletOf($admin);

        Sanctum::actingAs($admin);

        $this->getJson('/api/wallets')->assertForbidden();
        $this->getJson("/api/wallets/{$wallet->id}")->assertForbidden();
        $this->postJson("/api/wallets/{$wallet->id}/adjustments", [
            'amount' => 500,
            'reason' => 'Cadeau',
        ])->assertForbidden();
    }

    public function test_the_super_admin_reads_every_wallet(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 2548, $admin);
        $superAdmin = $this->superAdmin();

        Sanctum::actingAs($superAdmin);
        $response = $this->getJson('/api/wallets');

        $response->assertOk()
            ->assertJsonPath('data.admins.count', 1)
            ->assertJsonPath('data.admins.balance_total', fn ($value) => $this->money($value) === 2548.0)
            ->assertJsonPath('data.start_date', '2026-09-01');
    }

    // =====================================================================
    // Transfert vers le Super Admin
    // =====================================================================

    public function test_a_transfer_debits_the_admin_and_credits_the_patron(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 3500, $admin);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/wallet/transfers', ['amount' => 3000]);

        $response->assertCreated()
            ->assertJsonPath('data.type', 'TRANSFER_TO_SUPER_ADMIN')
            ->assertJsonPath('data.direction', 'out')
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 500.0);

        $this->assertSame('500.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame('3000.00', (string) $this->walletOf($superAdmin)->balance);

        // Deux jambes, un seul groupe : le transfert est indivisible et se
        // relit comme un tout.
        $legs = WalletTransaction::where('type', WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN)->get();
        $this->assertCount(2, $legs);
        $this->assertCount(1, $legs->pluck('transfer_group')->unique());
    }

    public function test_a_transfer_above_the_balance_is_refused_and_writes_nothing(): void
    {
        $admin = $this->admin();
        $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 1000, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 1500])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame('1000.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(
            0,
            WalletTransaction::where('type', WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN)->count(),
        );
    }

    public function test_an_identical_transfer_within_the_minute_is_refused_unless_confirmed(): void
    {
        $admin = $this->admin();
        $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 5000, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 1000])->assertCreated();

        // Le double appui est refusé...
        $this->postJson('/api/wallet/transfers', ['amount' => 1000])->assertStatus(422);

        // ...mais un second envoi réellement voulu reste possible.
        $this->postJson('/api/wallet/transfers', ['amount' => 1000, 'allow_duplicate' => true])
            ->assertCreated();

        $this->assertSame('3000.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_a_transfer_needs_a_super_admin_to_exist(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 1000, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 500])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame('1000.00', (string) $this->walletOf($admin)->balance);
    }

    // =====================================================================
    // Dépenses
    // =====================================================================

    public function test_a_wallet_expense_debits_the_wallet_and_is_traced(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 3000, $admin);

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/wallet/expenses', [
            'amount' => 800,
            'label' => 'Batterie',
            'category' => 'materiel',
            'spent_on' => '2026-09-10',
            'notes' => 'Batterie du rideau metallique',
            'reference' => 'FACT-2026-114',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.type', 'EXPENSE')
            ->assertJsonPath('data.amount', fn ($value) => $this->money($value) === 800.0)
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 2200.0);

        $expense = Expense::where('origin', Expense::ORIGIN_WALLET)->firstOrFail();
        $this->assertSame('Batterie', $expense->label);
        $this->assertSame('materiel', $expense->category);
        $this->assertSame($admin->id, $expense->user_id);
        $this->assertSame($this->walletOf($admin)->id, $expense->wallet_id);
        $this->assertNull($expense->work_day_id);
        $this->assertSame('FACT-2026-114', $expense->reference);
        $this->assertNotNull($expense->created_at);
    }

    public function test_a_wallet_expense_above_the_balance_is_refused(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 300, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/expenses', ['amount' => 800, 'label' => 'Batterie'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame(0, Expense::where('origin', Expense::ORIGIN_WALLET)->count());
        $this->assertSame('300.00', (string) $this->walletOf($admin)->balance);
    }

    /**
     * Le point le plus dangereux de toute la fonctionnalité : une dépense
     * payée sur le portefeuille est déjà financée par un résultat de caisse
     * déjà compté. Si elle réapparaissait dans les rapports de caisse, le même
     * argent serait déduit deux fois.
     */
    public function test_a_wallet_expense_never_leaks_into_the_caisse_reports(): void
    {
        $admin = $this->admin();
        $day = $this->closeDayWithResult('2026-09-05', 3000, $admin);

        Expense::create([
            'work_day_id' => $day->id,
            'label' => 'Cafe',
            'category' => 'general',
            'amount' => 120,
            'spent_on' => '2026-09-05',
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/expenses', [
            'amount' => 800,
            'label' => 'Batterie',
            'spent_on' => '2026-09-10',
        ])->assertCreated();

        // La liste Dépenses ne montre que la caisse, comme avant.
        $listed = $this->getJson('/api/expenses')->assertOk()->json('data');
        $this->assertCount(1, $listed);
        $this->assertSame('Cafe', $listed[0]['label']);

        // ...et l'origine `wallet` reste consultable pour qui la demande.
        $walletExpenses = $this->getJson('/api/expenses?origin=wallet')->assertOk()->json('data');
        $this->assertCount(1, $walletExpenses);
        $this->assertSame('Batterie', $walletExpenses[0]['label']);

        // Le rapport mensuel ignore la dépense wallet : 120 DH, pas 920.
        $report = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data');
        $this->assertSame(120.0, $this->money($report['totals']['expenses_total']));
    }

    // =====================================================================
    // Fond de caisse
    // =====================================================================

    public function test_the_cash_fund_is_held_apart_from_the_available_balance(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 1236, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/cash-fund', ['amount' => 565])
            ->assertCreated()
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 671.0)
            ->assertJsonPath('wallet.cash_fund_balance', fn ($value) => $this->money($value) === 565.0);

        $wallet = $this->walletOf($admin);
        // L'argent n'a pas quitté l'admin : il a changé de poche.
        $this->assertSame(1236.0, $wallet->totalHeld());
        // Et surtout, il n'a rien à voir avec ce qui est parti chez le patron.
        $this->assertSame(0.0, app(WalletService::class)->summary($wallet)['transfers_sent_total']);
    }

    public function test_the_cash_fund_can_be_taken_back(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 1000, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/cash-fund', ['amount' => 600])->assertCreated();
        $this->postJson('/api/wallet/cash-fund/return', ['amount' => 250])
            ->assertCreated()
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 650.0)
            ->assertJsonPath('wallet.cash_fund_balance', fn ($value) => $this->money($value) === 350.0);

        // Reprendre plus que le fond est refusé.
        $this->postJson('/api/wallet/cash-fund/return', ['amount' => 400])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');
    }

    public function test_allocating_more_than_available_is_refused(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 300, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/cash-fund', ['amount' => 500])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');
    }

    // =====================================================================
    // Historique et filtres
    // =====================================================================

    public function test_the_history_can_be_filtered_by_type_period_and_work_day(): void
    {
        $admin = $this->admin();
        $this->superAdmin();
        $day = $this->closeDayWithResult('2026-09-05', 4000, $admin);
        $this->closeDayWithResult('2026-09-06', 1000, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 2000])->assertCreated();

        $all = $this->getJson('/api/wallet/transactions')->assertOk()->json('data');
        $this->assertCount(3, $all);

        $results = $this->getJson('/api/wallet/transactions?type=CASH_REGISTER_RESULT')
            ->assertOk()->json('data');
        $this->assertCount(2, $results);

        $ofDay = $this->getJson("/api/wallet/transactions?work_day_id={$day->id}")
            ->assertOk()->json('data');
        $this->assertCount(1, $ofDay);
        $this->assertSame(4000.0, $this->money($ofDay[0]['amount']));
        // Chaque crédit sait de quelle journée il vient.
        $this->assertSame('Journée du 05/09/2026', $ofDay[0]['source']['label']);

        $window = $this->getJson('/api/wallet/transactions?from=2026-09-06&to=2026-09-06')
            ->assertOk()->json('data');
        $this->assertCount(1, $window);
        $this->assertSame(1000.0, $this->money($window[0]['amount']));
    }

    // =====================================================================
    // Lien avec « Rapports par jour »
    // =====================================================================

    public function test_a_closed_day_reports_its_wallet_status(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-05', 2548, $admin);

        Sanctum::actingAs($admin);
        $days = $this->getJson('/api/work-days')->assertOk()->json('data');

        $this->assertSame('credited', $days[0]['wallet']['status']);
        $this->assertSame(2548.0, $this->money($days[0]['wallet']['amount']));
        $this->assertSame('Admin Caisse', $days[0]['wallet']['wallet_owner']);
        $this->assertSame(2548.0, $this->money($days[0]['report_snapshot']['net_result']));
    }

    public function test_a_day_before_the_start_date_is_reported_as_out_of_scope(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-08-20', 1900, $admin);

        Sanctum::actingAs($admin);
        $days = $this->getJson('/api/work-days')->assertOk()->json('data');

        $this->assertSame('out_of_scope', $days[0]['wallet']['status']);
        $this->assertNull($days[0]['wallet']['amount']);
        // Le rapport historique reste complet malgré tout.
        $this->assertSame(1900.0, $this->money($days[0]['report_snapshot']['net_result']));
    }

    // =====================================================================
    // Corrections traçables
    // =====================================================================

    public function test_the_super_admin_adjusts_a_wallet_and_the_movement_is_kept(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 1000, $admin);
        $wallet = $this->walletOf($admin);

        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/wallets/{$wallet->id}/adjustments", [
            'amount' => -150,
            'reason' => 'Erreur de saisie du 05/09',
        ])->assertCreated()->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 850.0);

        $this->assertSame(2, WalletTransaction::where('wallet_id', $wallet->id)->count());
    }

    public function test_reversing_a_transfer_cancels_both_legs_without_deleting_anything(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 5000, $admin);

        Sanctum::actingAs($admin);
        $transferId = $this->postJson('/api/wallet/transfers', ['amount' => 2000])
            ->assertCreated()->json('data.id');

        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/wallet-transactions/{$transferId}/reverse", [
            'reason' => 'Remise annulee',
        ])->assertCreated();

        $this->assertSame('5000.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame('0.00', (string) $this->walletOf($superAdmin)->balance);

        // Rien n'a disparu : le transfert ET son annulation sont là.
        $this->assertSame(2, WalletTransaction::where('type', WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN)->count());
        $this->assertSame(2, WalletTransaction::where('type', WalletTransaction::TYPE_ADJUSTMENT)->count());

        // Et on ne l'annule pas deux fois.
        $this->postJson("/api/wallet-transactions/{$transferId}/reverse", [
            'reason' => 'Encore',
        ])->assertStatus(422);
    }

    public function test_a_reversed_day_credit_is_reported_as_reversed(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();
        $this->closeDayWithResult('2026-09-05', 2548, $admin);
        $credit = WalletTransaction::where('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)->firstOrFail();

        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/wallet-transactions/{$credit->id}/reverse", [
            'reason' => 'Journee ressaisie',
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $days = $this->getJson('/api/work-days')->assertOk()->json('data');
        $this->assertSame('reversed', $days[0]['wallet']['status']);
        $this->assertSame('0.00', (string) $this->walletOf($admin)->balance);
    }

    // =====================================================================
    // Les deux scénarios réels
    // =====================================================================

    /**
     * Le cumul demandé, transposé après la date de démarrage : sept journées
     * de caisse du 6 au 12 septembre, 18 856 DH au total, plus l'argent
     * ancien réintroduit EXPLICITEMENT par le patron (aucun backfill
     * automatique n'existe), puis une remise de 15 000 DH.
     *
     * Aucun de ces chiffres n'est saisi à la main : ils sont tous obtenus par
     * accumulation des mouvements.
     */
    public function test_the_real_scenario_adds_up_without_a_single_manual_calculation(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();

        $results = [
            '2026-09-06' => 1763,
            '2026-09-07' => 2873,
            '2026-09-08' => 2287,
            '2026-09-09' => 1705,
            '2026-09-10' => 3400,
            '2026-09-11' => 3428,
            '2026-09-12' => 3400,
        ];

        foreach ($results as $date => $amount) {
            $this->closeDayWithResult($date, $amount, $admin);
        }

        $wallet = $this->walletOf($admin);
        $this->assertSame('18856.00', (string) $wallet->balance);

        // L'argent detenu avant le portefeuille n'entre JAMAIS tout seul. Il
        // entre par un ajustement du patron, date, signe et relisable : 400 DH
        // d'espèces + 670 DH d'ancien fond de caisse.
        Sanctum::actingAs($superAdmin);
        $this->postJson("/api/wallets/{$wallet->id}/adjustments", [
            'amount' => 1070,
            'reason' => 'Reprise de l\'argent detenu avant le portefeuille',
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/cash-fund', ['amount' => 670])->assertCreated();

        $wallet = $this->walletOf($admin);
        $this->assertSame(19926.0, $wallet->totalHeld());

        $this->postJson('/api/wallet/transfers', ['amount' => 15000])->assertCreated();

        $wallet = $this->walletOf($admin);
        $this->assertSame('4256.00', (string) $wallet->balance);
        $this->assertSame('670.00', (string) $wallet->cash_fund_balance);
        // « Reste Admin : 4 926 DH » — disponible + fond de caisse.
        $this->assertSame(4926.0, $wallet->totalHeld());
        $this->assertSame('15000.00', (string) $this->walletOf($superAdmin)->balance);

        // Le systeme continue : la journee suivante s'ajoute au reste.
        $this->closeDayWithResult('2026-09-13', 2000, $admin);
        $this->assertSame('6256.00', (string) $this->walletOf($admin)->balance);

        $summary = app(WalletService::class)->summary($this->walletOf($admin));
        $this->assertSame(20856.0, $summary['cash_registers_total']);
        $this->assertSame(15000.0, $summary['transfers_sent_total']);
        $this->assertSame(670.0, $summary['cash_fund_balance']);
        $this->assertTrue(app(WalletService::class)->reconcile($this->walletOf($admin))['balanced']);
    }

    /** Second scenario : 17 036 − 15 000 − 800 = 1 236 DH. */
    public function test_the_second_real_scenario_lands_on_1236(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();

        $this->closeDayWithResult('2026-09-14', 9036, $admin);
        $this->closeDayWithResult('2026-09-15', 8000, $admin);

        $this->assertSame('17036.00', (string) $this->walletOf($admin)->balance);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 15000])->assertCreated();
        $this->postJson('/api/wallet/expenses', [
            'amount' => 800,
            'label' => 'Batterie',
            'category' => 'materiel',
        ])->assertCreated();

        $this->assertSame('1236.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame('15000.00', (string) $this->walletOf($superAdmin)->balance);

        // Puis 565 DH passent en fond de caisse : 671 disponibles, 1 236 detenus.
        $this->postJson('/api/wallet/cash-fund', ['amount' => 565])->assertCreated();
        $wallet = $this->walletOf($admin);
        $this->assertSame('671.00', (string) $wallet->balance);
        $this->assertSame(1236.0, $wallet->totalHeld());

        // La vue globale du patron dit la meme chose, sans recalcul.
        Sanctum::actingAs($superAdmin);
        $overview = $this->getJson('/api/wallets')->assertOk()->json('data');
        $this->assertSame(15000.0, $this->money($overview['super_admin']['received_total']));
        $this->assertSame(671.0, $this->money($overview['admins']['balance_total']));
        $this->assertSame(565.0, $this->money($overview['admins']['cash_fund_total']));
        $this->assertSame(800.0, $this->money($overview['admins']['expenses_total']));
    }

    public function test_every_wallet_reconciles_with_its_ledger(): void
    {
        $admin = $this->admin();
        $superAdmin = $this->superAdmin();

        $this->closeDayWithResult('2026-09-14', 5000, $admin);
        $this->closeDayWithResult('2026-09-15', 3333.33, $admin);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 1111.11])->assertCreated();
        $this->postJson('/api/wallet/expenses', ['amount' => 222.22, 'label' => 'Assurance'])->assertCreated();
        $this->postJson('/api/wallet/cash-fund', ['amount' => 333.33])->assertCreated();
        $this->postJson('/api/wallet/cash-fund/return', ['amount' => 111.11])->assertCreated();

        $service = app(WalletService::class);

        foreach (Wallet::all() as $wallet) {
            $this->assertTrue(
                $service->reconcile($wallet)['balanced'],
                "Le portefeuille #{$wallet->id} ne correspond pas a son historique.",
            );
        }

        // Les centimes tiennent : 5000 + 3333.33 − 1111.11 − 222.22 − 333.33 + 111.11
        $wallet = $this->walletOf($admin);
        $this->assertSame('6777.78', (string) $wallet->balance);
        $this->assertSame('222.22', (string) $wallet->cash_fund_balance);
        $this->assertSame('1111.11', (string) $this->walletOf($superAdmin)->balance);
    }
}
