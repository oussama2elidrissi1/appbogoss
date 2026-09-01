<?php

namespace Tests\Feature;

use App\Models\Advance;
use App\Models\CommissionPayout;
use App\Models\Employee;
use App\Models\Sale;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WorkDay;
use App\Services\CommissionPayoutService;
use App\Services\WalletService;
use App\Services\WorkDayService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Les trois flux ajoutés au portefeuille : apport du patron, envoi du patron
 * vers un admin, paiement d'un employé.
 *
 * La suite protège surtout une frontière : le portefeuille enregistre des
 * MOUVEMENTS d'argent, la paie enregistre des OBLIGATIONS. Confondre les deux
 * ferait sortir deux fois le même argent — c'est ce que vérifient les tests de
 * la dernière section.
 */
class WalletFlowsTest extends TestCase
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

    private function admin(string $name = 'Admin BOGOSLAND'): User
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

    private function walletOf(User $user): Wallet
    {
        return app(WalletService::class)->walletFor($user);
    }

    /** Une journée clôturée, donc un portefeuille d'admin alimenté. */
    private function fundAdmin(User $admin, float $amount, string $date = '2026-09-05'): WorkDay
    {
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => $date,
            'opened_by_user_id' => $admin->id,
            'opening_balance' => 0,
            'status' => 'open',
        ]);

        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client de passage',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $amount,
            'payment_method' => 'especes',
        ]);

        Sanctum::actingAs($admin);

        return app(WorkDayService::class)->closeDay($day->fresh());
    }

    /** `json_encode` sérialise 20000.00 en entier : on ramène tout au même terrain. */
    private function money(mixed $value): float
    {
        return round((float) $value, 2);
    }

    // =====================================================================
    // 1. Apport du patron
    // =====================================================================

    public function test_the_owner_loads_their_own_wallet(): void
    {
        $superAdmin = $this->superAdmin();
        $wallet = $this->walletOf($superAdmin);

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', [
            'amount' => 20000,
            'reason' => 'Apport especes',
            'reference' => 'CAISSE-01',
            'notes' => 'Retrait bancaire du 20/09',
        ])
            ->assertCreated()
            ->assertJsonPath('data.type', 'OWNER_DEPOSIT')
            ->assertJsonPath('data.direction', 'in')
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 20000.0);

        $this->assertSame('20000.00', (string) $wallet->fresh()->balance);

        $movement = WalletTransaction::where('type', WalletTransaction::TYPE_OWNER_DEPOSIT)->firstOrFail();
        $this->assertSame($superAdmin->id, $movement->performed_by_user_id);
        $this->assertSame('CAISSE-01', $movement->reference);
        $this->assertStringContainsString('Apport especes', (string) $movement->description);
        $this->assertStringContainsString('Retrait bancaire', (string) $movement->description);
        $this->assertNotNull($movement->created_at);
        $this->assertNotNull($movement->occurred_at);
    }

    public function test_a_deposit_adds_up_on_an_existing_balance(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->fundAdmin($admin, 10000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 10000])->assertCreated();

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', [
            'amount' => 20000,
            'reason' => 'Apport especes',
        ])->assertCreated();

        // 10 000 recus des admins + 20 000 apportes = 30 000.
        $this->assertSame('30000.00', (string) $this->walletOf($superAdmin)->balance);

        $summary = app(WalletService::class)->summary($this->walletOf($superAdmin));
        // Les deux origines restent distinguables : c'est toute la question
        // « combien le patron a-t-il injecte lui-meme ? ».
        $this->assertSame(20000.0, $summary['owner_deposits_total']);
        $this->assertSame(10000.0, $summary['transfers_received_total']);
    }

    public function test_an_admin_cannot_load_a_wallet(): void
    {
        $admin = $this->admin();
        $this->superAdmin();

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/deposits', [
            'amount' => 20000,
            'reason' => 'Apport',
        ])->assertForbidden();

        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_a_deposit_needs_a_reason(): void
    {
        $superAdmin = $this->superAdmin();

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', ['amount' => 20000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $this->assertSame(0, WalletTransaction::count());
    }

    // =====================================================================
    // 2. Super Admin → Admin
    // =====================================================================

    public function test_the_owner_sends_money_back_to_an_admin(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->fundAdmin($admin, 2000);
        $adminWallet = $this->walletOf($admin);

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', [
            'amount' => 30000,
            'reason' => 'Apport especes',
        ])->assertCreated();

        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $adminWallet->id,
            'amount' => 5000,
            'description' => 'Reappro caisse',
        ])
            ->assertCreated()
            ->assertJsonPath('data.type', 'TRANSFER_TO_ADMIN')
            ->assertJsonPath('data.direction', 'out')
            ->assertJsonPath('data.type_label', 'Envoyé à un Admin');

        $this->assertSame('25000.00', (string) $this->walletOf($superAdmin)->balance);
        $this->assertSame('7000.00', (string) $this->walletOf($admin)->balance);

        // Double ecriture : deux jambes, un seul groupe.
        $legs = WalletTransaction::where('type', WalletTransaction::TYPE_TRANSFER_TO_ADMIN)->get();
        $this->assertCount(2, $legs);
        $this->assertCount(1, $legs->pluck('transfer_group')->unique());
        $this->assertSame(
            $adminWallet->id,
            $legs->firstWhere('direction', 'out')->counterparty_wallet_id,
        );

        // Chacun lit le mouvement de son cote, dans ses mots.
        Sanctum::actingAs($admin);
        $received = $this->getJson('/api/wallet/transactions?type=TRANSFER_TO_ADMIN')
            ->assertOk()->json('data');
        $this->assertCount(1, $received);
        $this->assertSame('Reçu du Super Admin', $received[0]['type_label']);
        $this->assertSame(5000.0, $this->money($received[0]['amount']));
    }

    public function test_a_transfer_above_the_owner_balance_is_refused_and_writes_nothing(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->fundAdmin($admin, 2000);
        $adminWallet = $this->walletOf($admin);

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', ['amount' => 1000, 'reason' => 'Apport'])
            ->assertCreated();

        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $adminWallet->id,
            'amount' => 5000,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        // Aucune demi-transaction : ni debit, ni credit, ni ligne de ledger.
        $this->assertSame('1000.00', (string) $this->walletOf($superAdmin)->balance);
        $this->assertSame('2000.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(
            0,
            WalletTransaction::where('type', WalletTransaction::TYPE_TRANSFER_TO_ADMIN)->count(),
        );
    }

    public function test_an_admin_cannot_send_money_to_another_admin(): void
    {
        $admin = $this->admin();
        $other = $this->admin('Deuxieme Admin');
        $this->superAdmin();
        $this->fundAdmin($admin, 5000);
        $otherWallet = $this->walletOf($other);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $otherWallet->id,
            'amount' => 1000,
        ])->assertForbidden();

        $this->assertSame('5000.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame('0.00', (string) $otherWallet->fresh()->balance);
    }

    public function test_the_owner_cannot_disguise_a_transfer_between_two_owners(): void
    {
        $superAdmin = $this->superAdmin();
        $secondOwner = User::factory()->create(['name' => 'Associe', 'role' => 'super-admin']);
        $secondOwner->assignRole('super-admin');
        $secondWallet = $this->walletOf($secondOwner);

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', ['amount' => 5000, 'reason' => 'Apport'])
            ->assertCreated();

        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $secondWallet->id,
            'amount' => 1000,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('wallet_id');
    }

    // =====================================================================
    // 3. Paiement des employés
    // =====================================================================

    public function test_an_admin_pays_an_employee_from_their_wallet(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdmin($admin, 15000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'salary',
            'period' => '2026-08',
            'note' => 'Salaire aout 2026',
        ])
            ->assertCreated()
            ->assertJsonPath('data.type', 'EMPLOYEE_PAYMENT')
            ->assertJsonPath('data.category_label', 'Salaire')
            ->assertJsonPath('data.employee_id', $employee->id)
            ->assertJsonPath('wallet.balance', fn ($value) => $this->money($value) === 12000.0);

        $this->assertSame('12000.00', (string) $this->walletOf($admin)->balance);

        $movement = WalletTransaction::where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)->firstOrFail();
        $this->assertSame($employee->id, $movement->employee_id);
        $this->assertSame('2026-08', $movement->period);
        $this->assertSame('salary', $movement->category);
        $this->assertStringContainsString('Salaire aout 2026', (string) $movement->description);
    }

    public function test_a_payment_above_the_balance_is_refused(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdmin($admin, 500);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'salary',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame('500.00', (string) $this->walletOf($admin)->balance);
        $this->assertSame(
            0,
            WalletTransaction::where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)->count(),
        );
    }

    public function test_an_employee_account_cannot_pay_anyone(): void
    {
        $employee = Employee::factory()->create();

        Sanctum::actingAs($this->employeeUser());
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 100,
            'kind' => 'salary',
        ])->assertForbidden();
    }

    public function test_the_employee_history_answers_who_received_what(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $karim = Employee::factory()->create(['name' => 'Karim']);
        $this->fundAdmin($admin, 20000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id, 'amount' => 3000, 'kind' => 'salary', 'period' => '2026-08',
        ])->assertCreated();
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id, 'amount' => 500, 'kind' => 'advance',
        ])->assertCreated();
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id, 'amount' => 1200, 'kind' => 'commission',
        ])->assertCreated();
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $karim->id, 'amount' => 900, 'kind' => 'salary',
        ])->assertCreated();

        $history = $this->getJson("/api/employees/{$ahmed->id}/payments")
            ->assertOk()->json('data');

        // 3 000 + 500 + 1 200 — et surtout pas les 900 de Karim.
        $this->assertSame(4700.0, $this->money($history['total_paid']));
        $this->assertSame(3, $history['payments_count']);
        $this->assertSame(1200.0, $this->money($history['last_payment_amount']));
        $this->assertCount(3, $history['payments']);
        $this->assertSame(
            ['Salaire', 'Commission', 'Avance'],
            array_column($history['by_kind'], 'label'),
        );

        $karimHistory = $this->getJson("/api/employees/{$karim->id}/payments")
            ->assertOk()->json('data');
        $this->assertSame(900.0, $this->money($karimHistory['total_paid']));
    }

    // =====================================================================
    // 4. Obligation contre mouvement — la frontière à ne pas franchir
    // =====================================================================

    /**
     * Une avance payée sur le portefeuille reste une DETTE de l'employé : elle
     * doit être nettée à la paie comme n'importe quelle autre. Sans cela, le
     * salon lui verserait deux fois le même argent.
     */
    public function test_a_wallet_advance_still_counts_against_the_payroll(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdmin($admin, 5000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 500,
            'kind' => 'advance',
        ])->assertCreated();

        $advance = Advance::where('employee_id', $employee->id)->firstOrFail();
        $this->assertSame(Advance::ORIGIN_WALLET, $advance->origin);
        $this->assertNull($advance->work_day_id);
        $this->assertNull($advance->settled_at);

        $preview = app(CommissionPayoutService::class)->preview($employee, '2026-09');
        $this->assertSame(500.0, $preview['advances_outstanding']);
    }

    /**
     * ...mais elle ne doit JAMAIS reparaître dans les rapports de caisse. Elle
     * est sortie du portefeuille, pas du tiroir : l'y compter la déduirait une
     * seconde fois du même argent.
     */
    public function test_a_wallet_advance_never_leaks_into_the_caisse_reports(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $day = $this->fundAdmin($admin, 5000, '2026-09-05');

        Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $day->id,
            'amount' => 200,
            'given_on' => '2026-09-05',
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 500,
            'kind' => 'advance',
        ])->assertCreated();

        $report = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data');

        // 200 DH sortis du tiroir, et rien d'autre : les 500 du portefeuille
        // sont ailleurs.
        $this->assertSame(200.0, $this->money($report['totals']['advances_total']));
    }

    /**
     * Le troisième piège : la paie a déjà sorti l'argent du tiroir via
     * `deduct_from_caisse`. Ce montant a donc déjà réduit le résultat de la
     * journée, donc déjà réduit ce portefeuille.
     */
    public function test_a_commission_already_taken_from_the_till_cannot_be_paid_again(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $day = $this->fundAdmin($admin, 9000, '2026-09-05');

        $payout = CommissionPayout::create([
            'employee_id' => $employee->id,
            'period' => '2026-09',
            'commission_total' => 3000,
            'advances_deducted' => 0,
            'net_amount' => 3000,
            'paid_by_user_id' => $admin->id,
            'paid_at' => now(),
        ]);

        // Ce que fait `deduct_from_caisse` : une avance soldee sur la journee.
        Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $day->id,
            'amount' => 3000,
            'reason' => 'Paiement commission 2026-09',
            'given_on' => '2026-09-05',
            'settled_at' => now(),
            'commission_payout_id' => $payout->id,
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame(
            0,
            WalletTransaction::where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)->count(),
        );

        // Le refus reste franchissable en connaissance de cause — un versement
        // partiel complementaire, par exemple — mais jamais par inadvertance.
        // Deux avertissements distincts, donc deux confirmations distinctes :
        // « c'est deja sorti du tiroir » et « ca depasse le reste du » ne
        // disent pas la meme chose et ne se levent pas ensemble.
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
            'acknowledge_duplicate' => true,
            'acknowledge_over_due' => true,
        ])->assertCreated();
    }

    public function test_an_identical_payment_within_the_minute_is_refused(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdmin($admin, 10000);

        Sanctum::actingAs($admin);
        $payload = [
            'employee_id' => $employee->id,
            'amount' => 1000,
            'kind' => 'salary',
        ];

        $this->postJson('/api/wallet/employee-payments', $payload)->assertCreated();
        $this->postJson('/api/wallet/employee-payments', $payload)->assertStatus(422);
        $this->postJson('/api/wallet/employee-payments', [...$payload, 'acknowledge_duplicate' => true])
            ->assertCreated();

        $this->assertSame('8000.00', (string) $this->walletOf($admin)->balance);
    }

    /** Un paiement d'employé ne touche jamais la caisse. */
    public function test_an_employee_payment_leaves_the_cash_reports_untouched(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdmin($admin, 9000, '2026-09-05');

        Sanctum::actingAs($admin);
        $before = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data.totals');

        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'salary',
        ])->assertCreated();

        $after = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data.totals');

        $this->assertSame($before['net_result'], $after['net_result']);
        $this->assertSame($before['expenses_total'], $after['expenses_total']);
        $this->assertSame($before['advances_total'], $after['advances_total']);
    }

    // =====================================================================
    // 5. Vue globale et réconciliation
    // =====================================================================

    public function test_the_global_view_separates_every_flow(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdmin($admin, 10000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/transfers', ['amount' => 4000])->assertCreated();
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id, 'amount' => 1500, 'kind' => 'salary',
        ])->assertCreated();
        $this->postJson('/api/wallet/expenses', ['amount' => 500, 'label' => 'Batterie'])->assertCreated();
        $this->postJson('/api/wallet/cash-fund', ['amount' => 1000])->assertCreated();

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', ['amount' => 20000, 'reason' => 'Apport'])->assertCreated();
        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $this->walletOf($admin)->id,
            'amount' => 2000,
        ])->assertCreated();

        $overview = $this->getJson('/api/wallets')->assertOk()->json('data');

        // Patron : 4 000 recus + 20 000 apportes - 2 000 renvoyes = 22 000.
        $this->assertSame(22000.0, $this->money($overview['super_admin']['balance']));
        $this->assertSame(20000.0, $this->money($overview['super_admin']['deposits_total']));
        $this->assertSame(4000.0, $this->money($overview['super_admin']['received_total']));
        $this->assertSame(2000.0, $this->money($overview['super_admin']['sent_to_admins_total']));

        // Admin : 10 000 - 4 000 - 1 500 - 500 - 1 000 (fond) + 2 000 = 5 000.
        $this->assertSame(5000.0, $this->money($overview['admins']['balance_total']));
        $this->assertSame(1000.0, $this->money($overview['admins']['cash_fund_total']));
        $this->assertSame(2000.0, $this->money($overview['admins']['received_from_super_admin_total']));
        $this->assertSame(1500.0, $this->money($overview['admins']['employee_payments_total']));
        $this->assertSame(1500.0, $this->money($overview['employee_payments_total']));
        $this->assertSame(500.0, $this->money($overview['expenses_total']));
    }

    public function test_every_wallet_still_reconciles_after_the_new_flows(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdmin($admin, 7777.77);

        Sanctum::actingAs($superAdmin);
        $this->postJson('/api/wallet/deposits', ['amount' => 1234.56, 'reason' => 'Apport'])->assertCreated();
        $this->postJson('/api/wallet/transfers/admin', [
            'wallet_id' => $this->walletOf($admin)->id,
            'amount' => 234.56,
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id, 'amount' => 111.11, 'kind' => 'advance',
        ])->assertCreated();
        $this->postJson('/api/wallet/cash-fund', ['amount' => 333.33])->assertCreated();
        $this->postJson('/api/wallet/transfers', ['amount' => 1000.01])->assertCreated();

        $service = app(WalletService::class);

        foreach (Wallet::all() as $wallet) {
            $this->assertTrue(
                $service->reconcile($wallet)['balanced'],
                "Le portefeuille #{$wallet->id} ne correspond plus a son historique.",
            );
        }

        // 7777.77 + 234.56 - 111.11 - 333.33 - 1000.01
        $this->assertSame('6567.88', (string) $this->walletOf($admin)->balance);
        $this->assertSame('333.33', (string) $this->walletOf($admin)->cash_fund_balance);
        // 1234.56 - 234.56 + 1000.01
        $this->assertSame('2000.01', (string) $this->walletOf($superAdmin)->balance);
    }

    /** Une contre-passe annule un apport comme n'importe quel autre mouvement. */
    public function test_a_deposit_can_be_reversed_without_being_deleted(): void
    {
        $superAdmin = $this->superAdmin();

        Sanctum::actingAs($superAdmin);
        $depositId = $this->postJson('/api/wallet/deposits', [
            'amount' => 20000,
            'reason' => 'Apport saisi en double',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/wallet-transactions/{$depositId}/reverse", [
            'reason' => 'Apport saisi en double',
        ])->assertCreated();

        $this->assertSame('0.00', (string) $this->walletOf($superAdmin)->balance);
        // Rien n'a disparu : l'apport ET son annulation sont la.
        $this->assertSame(2, WalletTransaction::count());
        $this->assertTrue(
            app(WalletService::class)->reconcile($this->walletOf($superAdmin))['balanced'],
        );
    }
}
