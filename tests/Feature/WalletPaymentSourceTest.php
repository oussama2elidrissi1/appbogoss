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
use App\Services\WalletService;
use App\Services\WorkDayService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * D'où sort l'argent.
 *
 * Toute cette suite protège une seule idée : un paiement à un employé peut
 * sortir de deux endroits — le tiroir ou le portefeuille — et les deux ne se
 * comportent pas pareil. Le tiroir réduit le résultat de la journée ; le
 * portefeuille non, parce que ce résultat lui a déjà été crédité.
 *
 * Confondre les deux, c'est soit compter l'argent deux fois, soit le perdre de
 * vue. Les tests ci-dessous vérifient que le système sait toujours lequel des
 * deux a été utilisé, et qu'il le dit.
 */
class WalletPaymentSourceTest extends TestCase
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

    private function walletOf(User $user): Wallet
    {
        return app(WalletService::class)->walletFor($user);
    }

    private function money(mixed $value): float
    {
        return round((float) $value, 2);
    }

    /**
     * Une journée clôturée : le portefeuille de l'admin est alimenté, et
     * surtout AUCUNE journée ne reste ouverte ensuite.
     */
    private function fundAdminAndCloseTheDay(User $admin, float $amount, string $date = '2026-09-05'): WorkDay
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

    /** Une commission héritée de la caisse, datée dans la période voulue. */
    private function earnCommission(Employee $employee, float $amount, string $on): void
    {
        $sale = Sale::create([
            'work_day_id' => null,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $amount * 4,
            'commission_amount' => $amount,
            'payment_method' => 'especes',
        ]);

        $sale->forceFill(['created_at' => $on.' 12:00:00'])->save();
    }

    // =====================================================================
    // Journée de caisse ouverte ou non
    // =====================================================================

    public function test_a_wallet_payment_works_with_no_open_cash_day(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 9000);

        // Rien n'est ouvert : c'est justement le cas ou l'argent du
        // portefeuille est la seule source disponible.
        $this->assertSame(0, WorkDay::where('status', 'open')->count());

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'salary',
        ])->assertCreated();

        $this->assertSame('6000.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_a_payout_from_the_till_is_refused_with_no_open_cash_day(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 9000);
        $this->earnCommission($employee, 3000, '2026-09-10');

        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => '2026-09',
            'deduct_from_caisse' => true,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('deduct_from_caisse');

        // Ni paie enregistree, ni argent sorti : l'operation entiere est
        // refusee, pas a moitie faite.
        $this->assertSame(0, CommissionPayout::count());
        $this->assertSame(0, Advance::count());
    }

    // =====================================================================
    // Le paiement portefeuille ne touche jamais la caisse
    // =====================================================================

    public function test_an_employee_payment_leaves_every_cash_total_untouched(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdminAndCloseTheDay($admin, 9000, '2026-09-05');

        Sanctum::actingAs($admin);
        $before = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data');

        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 2500,
            'kind' => 'advance',
        ])->assertCreated();

        $after = $this->getJson('/api/reports/monthly?month=2026-09')->assertOk()->json('data');

        $this->assertSame($before['totals']['net_result'], $after['totals']['net_result']);
        $this->assertSame($before['totals']['advances_total'], $after['totals']['advances_total']);
        $this->assertSame($before['totals']['expenses_total'], $after['totals']['expenses_total']);
        // La journee elle-meme non plus n'a pas bouge.
        $this->assertSame($before['days'][0]['net_result'], $after['days'][0]['net_result']);
    }

    // =====================================================================
    // La source, dans l'historique de l'employé
    // =====================================================================

    public function test_the_history_says_where_each_payment_came_from(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $day = $this->fundAdminAndCloseTheDay($admin, 20000, '2026-09-05');

        // Sortie du tiroir : une avance classique rattachee a la journee.
        Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $day->id,
            'amount' => 400,
            'reason' => 'Depannage',
            'given_on' => '2026-09-05',
        ]);

        // Sortie du tiroir aussi : le net d'une paie versee avec sortie de
        // caisse, que CommissionPayoutService ecrit comme avance soldee.
        $payout = CommissionPayout::create([
            'employee_id' => $employee->id,
            'period' => '2026-09',
            'commission_total' => 1200,
            'advances_deducted' => 0,
            'net_amount' => 1200,
            'paid_by_user_id' => $admin->id,
            'paid_at' => now(),
        ]);
        Advance::create([
            'employee_id' => $employee->id,
            'work_day_id' => $day->id,
            'amount' => 1200,
            'reason' => 'Paiement commission 2026-09',
            'given_on' => '2026-09-06',
            'settled_at' => now(),
            'commission_payout_id' => $payout->id,
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'salary',
            'period' => '2026-08',
        ])->assertCreated();

        $history = $this->getJson("/api/employees/{$employee->id}/payments")
            ->assertOk()->json('data');

        $this->assertSame(4600.0, $this->money($history['total_paid']));
        $this->assertSame(3000.0, $this->money($history['wallet_total']));
        $this->assertSame(1600.0, $this->money($history['caisse_total']));

        $bySource = collect($history['payments'])->groupBy('source');
        $this->assertCount(1, $bySource['wallet']);
        $this->assertCount(2, $bySource['caisse']);

        // Le net d'une paie sortie du tiroir se lit « Commission », pas
        // « Avance » : c'est ce que l'employe a reellement recu.
        $caisseKinds = collect($bySource['caisse'])->pluck('kind')->sort()->values()->all();
        $this->assertSame(['advance', 'commission'], $caisseKinds);

        $walletRow = $bySource['wallet']->first();
        $this->assertSame('Portefeuille', $walletRow['source_label']);
        $this->assertSame('Salaire', $walletRow['kind_label']);
        $this->assertSame('2026-08', $walletRow['period']);
    }

    /**
     * Une avance payée sur le portefeuille ne doit apparaître QU'UNE fois :
     * elle a une ligne de ledger et une ligne d'avance, et les deux décrivent
     * le même argent.
     */
    public function test_a_wallet_advance_appears_once_and_only_once(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdminAndCloseTheDay($admin, 5000);

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 500,
            'kind' => 'advance',
        ])->assertCreated();

        $history = $this->getJson("/api/employees/{$employee->id}/payments")
            ->assertOk()->json('data');

        $this->assertSame(1, $history['payments_count']);
        $this->assertSame(500.0, $this->money($history['total_paid']));
        $this->assertSame(0.0, $this->money($history['caisse_total']));
        $this->assertSame('wallet', $history['payments'][0]['source']);
    }

    // =====================================================================
    // Paiements partiels et reste à payer
    // =====================================================================

    public function test_a_salary_can_be_paid_in_several_instalments(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 20000);

        Sanctum::actingAs($admin);

        foreach ([2000, 1000, 1000] as $index => $amount) {
            $this->postJson('/api/wallet/employee-payments', [
                'employee_id' => $employee->id,
                'amount' => $amount,
                'kind' => 'salary',
                'period' => '2026-08',
                // Deux versements de 1 000 se suivent : le garde-fou anti
                // double appui doit etre leve en connaissance de cause.
                'acknowledge_duplicate' => $index === 2,
            ])->assertCreated();
        }

        $history = $this->getJson("/api/employees/{$employee->id}/payments")
            ->assertOk()->json('data');

        $this->assertSame(3, $history['payments_count']);
        $this->assertSame(4000.0, $this->money($history['total_paid']));

        // Aucun de ces versements n'a solde « toute la periode » : ils
        // s'additionnent, ce qui est bien le comportement attendu.
        $context = $this->getJson(
            "/api/employees/{$employee->id}/payment-context?period=2026-08&kind=salary",
        )->assertOk()->json('data');

        $this->assertSame(4000.0, $this->money($context['already_paid_total']));
        $this->assertSame(4000.0, $this->money($context['already_paid_wallet']));
        // Pas de salaire de reference en base : l'ecran le dit plutot que
        // d'inventer un montant du.
        $this->assertNull($context['due_total']);
        $this->assertNull($context['remaining']);
    }

    public function test_the_remaining_amount_is_computed_for_a_commission(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 20000);
        $this->earnCommission($employee, 4000, '2026-09-10');

        Sanctum::actingAs($admin);

        $context = $this->getJson(
            "/api/employees/{$employee->id}/payment-context?period=2026-09&kind=commission",
        )->assertOk()->json('data');

        $this->assertSame(4000.0, $this->money($context['due_total']));
        $this->assertSame(0.0, $this->money($context['already_paid_total']));
        $this->assertSame(4000.0, $this->money($context['remaining']));

        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();

        $context = $this->getJson(
            "/api/employees/{$employee->id}/payment-context?period=2026-09&kind=commission",
        )->assertOk()->json('data');

        $this->assertSame(3000.0, $this->money($context['already_paid_total']));
        $this->assertSame(1000.0, $this->money($context['remaining']));
        $this->assertCount(1, $context['payments']);
    }

    public function test_paying_more_than_what_is_due_asks_for_an_explicit_confirmation(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 20000);
        $this->earnCommission($employee, 4000, '2026-09-10');

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();

        // Il ne reste que 1 000 : 2 000 doit alerter, pas passer en silence.
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 2000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');

        $this->assertSame('17000.00', (string) $this->walletOf($admin)->balance);

        // ...mais reste possible en l'assumant : un rattrapage est legitime.
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 2000,
            'kind' => 'commission',
            'period' => '2026-09',
            'acknowledge_over_due' => true,
        ])->assertCreated();

        $this->assertSame('15000.00', (string) $this->walletOf($admin)->balance);
    }

    public function test_a_payment_within_what_is_due_passes_without_a_warning(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create();
        $this->fundAdminAndCloseTheDay($admin, 20000);
        $this->earnCommission($employee, 4000, '2026-09-10');

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 4000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();
    }

    /**
     * Le cas complet : la commission est sortie du tiroir, puis on tente de la
     * repayer depuis le portefeuille. Les deux gardes se déclenchent, et le
     * résultat de caisse reste inchangé quoi qu'il arrive.
     */
    public function test_cash_and_wallet_never_pay_the_same_commission_twice_by_accident(): void
    {
        $admin = $this->admin();
        $employee = Employee::factory()->create(['name' => 'Ahmed']);
        $day = $this->fundAdminAndCloseTheDay($admin, 20000, '2026-09-05');
        $this->earnCommission($employee, 3000, '2026-09-04');

        $payout = CommissionPayout::create([
            'employee_id' => $employee->id,
            'period' => '2026-09',
            'commission_total' => 3000,
            'advances_deducted' => 0,
            'net_amount' => 3000,
            'paid_by_user_id' => $admin->id,
            'paid_at' => now(),
        ]);
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

        $context = $this->getJson(
            "/api/employees/{$employee->id}/payment-context?period=2026-09&kind=commission",
        )->assertOk()->json('data');

        // L'ecran le voit avant meme la tentative : tout est deja verse.
        $this->assertSame(3000.0, $this->money($context['already_paid_caisse']));
        $this->assertSame(0.0, $this->money($context['remaining']));

        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $employee->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertStatus(422);

        $this->assertSame(
            0,
            WalletTransaction::where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)->count(),
        );
    }

    // =====================================================================
    // Qui reste à payer, pour un mois donné
    // =====================================================================

    public function test_the_dues_list_answers_who_is_still_owed_money(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $karim = Employee::factory()->create(['name' => 'Karim']);
        $sofia = Employee::factory()->create(['name' => 'Sofia']);
        $day = $this->fundAdminAndCloseTheDay($admin, 30000, '2026-09-05');

        $this->earnCommission($ahmed, 4000, '2026-09-10');
        $this->earnCommission($karim, 2000, '2026-09-11');
        // Sofia n'a rien gagne et n'a rien recu : elle n'a rien a faire dans
        // une liste de « reste a payer ».

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id,
            'amount' => 3000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();

        // Karim a recu 500 DH du tiroir : de l'argent deja dans sa main, qui
        // reduit d'autant ce qu'il reste a lui donner.
        Advance::create([
            'employee_id' => $karim->id,
            'work_day_id' => $day->id,
            'amount' => 500,
            'reason' => 'Depannage',
            'given_on' => '2026-09-12',
        ]);

        $dues = $this->getJson('/api/wallet/employee-dues?period=2026-09')
            ->assertOk()->json('data');

        $this->assertSame('2026-09', $dues['period']);
        $this->assertCount(2, $dues['employees']);
        $this->assertSame(
            [$karim->id, $ahmed->id],
            array_column($dues['employees'], 'employee_id'),
            'La liste doit commencer par celui a qui il reste le plus.',
        );

        [$first, $second] = $dues['employees'];
        $this->assertSame('Karim', $first['employee_name']);
        $this->assertSame(1500.0, $this->money($first['remaining']));
        $this->assertSame(500.0, $this->money($first['paid_caisse']));
        $this->assertSame(0.0, $this->money($first['paid_wallet']));

        $this->assertSame('Ahmed', $second['employee_name']);
        $this->assertSame(4000.0, $this->money($second['due_total']));
        $this->assertSame(3000.0, $this->money($second['paid_wallet']));
        $this->assertSame(1000.0, $this->money($second['remaining']));

        $this->assertSame(6000.0, $this->money($dues['totals']['due_total']));
        $this->assertSame(3500.0, $this->money($dues['totals']['paid_total']));
        $this->assertSame(2500.0, $this->money($dues['totals']['remaining_total']));
        $this->assertSame(2, $dues['totals']['employees_remaining']);

        // Sofia reste absente, et c'est voulu.
        $this->assertNotContains(
            'Sofia',
            array_column($dues['employees'], 'employee_name'),
        );
    }

    public function test_the_dues_list_is_scoped_to_its_period(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 30000);

        $this->earnCommission($ahmed, 4000, '2026-09-10');
        $this->earnCommission($ahmed, 1000, '2026-08-10');

        Sanctum::actingAs($admin);
        // Un salaire d'aout paye en septembre compte pour AOUT : c'est la
        // periode qui l'etiquette, pas la date du mouvement.
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id,
            'amount' => 600,
            'kind' => 'salary',
            'period' => '2026-08',
        ])->assertCreated();

        $september = $this->getJson('/api/wallet/employee-dues?period=2026-09')
            ->assertOk()->json('data.employees.0');
        $august = $this->getJson('/api/wallet/employee-dues?period=2026-08')
            ->assertOk()->json('data.employees.0');

        $this->assertSame(4000.0, $this->money($september['due_total']));
        $this->assertSame(0.0, $this->money($september['paid_total']));

        $this->assertSame(1000.0, $this->money($august['due_total']));
        $this->assertSame(600.0, $this->money($august['paid_total']));
        $this->assertSame(400.0, $this->money($august['remaining']));
    }

    public function test_a_payment_larger_than_the_commission_never_shows_a_negative_remainder(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 30000);
        $this->earnCommission($ahmed, 1000, '2026-09-10');

        Sanctum::actingAs($admin);
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id,
            'amount' => 1500,
            'kind' => 'commission',
            'period' => '2026-09',
            'acknowledge_over_due' => true,
        ])->assertCreated();

        $row = $this->getJson('/api/wallet/employee-dues?period=2026-09')
            ->assertOk()->json('data.employees.0');

        // Verser plus que la commission est legitime, mais cela ne cree pas
        // une dette de l'employe : le reste s'arrete a zero.
        $this->assertSame(1500.0, $this->money($row['paid_total']));
        $this->assertSame(0.0, $this->money($row['remaining']));
    }

    public function test_the_dues_list_needs_the_wallet_permission(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        Sanctum::actingAs($user);
        $this->getJson('/api/wallet/employee-dues?period=2026-09')->assertForbidden();
    }

    /**
     * Le cas courant du salon : la commission dépasse largement ce que l'admin
     * détient, et elle se règle en plusieurs fois. Chaque versement doit
     * réduire le reste d'autant, sans jamais solder toute la période.
     */
    public function test_a_commission_is_settled_in_partial_payments(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 30000);
        $this->earnCommission($ahmed, 8000, '2026-09-10');

        Sanctum::actingAs($admin);

        $remaining = fn () => $this->money(
            $this->getJson("/api/employees/{$ahmed->id}/payment-context?period=2026-09&kind=commission")
                ->assertOk()->json('data.remaining'),
        );

        $this->assertSame(8000.0, $remaining());

        // 2 000 sur 8 000 : aucun avertissement, le reste tombe a 6 000.
        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id,
            'amount' => 2000,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();

        $this->assertSame(6000.0, $remaining());

        $this->postJson('/api/wallet/employee-payments', [
            'employee_id' => $ahmed->id,
            'amount' => 3500,
            'kind' => 'commission',
            'period' => '2026-09',
        ])->assertCreated();

        $this->assertSame(2500.0, $remaining());

        // La liste dit la meme chose, sans qu'on ait a ouvrir la fiche.
        $row = $this->getJson('/api/wallet/employee-dues?period=2026-09')
            ->assertOk()->json('data.employees.0');
        $this->assertSame(8000.0, $this->money($row['due_total']));
        $this->assertSame(5500.0, $this->money($row['paid_total']));
        $this->assertSame(2500.0, $this->money($row['remaining']));

        // Et l'employe a bien recu trois fois de l'argent, pas une.
        $history = $this->getJson("/api/employees/{$ahmed->id}/payments")
            ->assertOk()->json('data');
        $this->assertSame(2, $history['payments_count']);
        $this->assertSame(5500.0, $this->money($history['total_paid']));
    }

    /** Le dernier versement solde exactement, sans declencher d'avertissement. */
    public function test_the_last_instalment_closes_the_period_without_a_warning(): void
    {
        $admin = $this->admin();
        $ahmed = Employee::factory()->create(['name' => 'Ahmed']);
        $this->fundAdminAndCloseTheDay($admin, 30000);
        $this->earnCommission($ahmed, 8000, '2026-09-10');

        Sanctum::actingAs($admin);

        foreach ([2000, 3000, 3000] as $index => $amount) {
            $this->postJson('/api/wallet/employee-payments', [
                'employee_id' => $ahmed->id,
                'amount' => $amount,
                'kind' => 'commission',
                'period' => '2026-09',
                // Deux versements de 3 000 se suivent : seul le garde-fou du
                // double appui est leve, jamais celui du depassement.
                'acknowledge_duplicate' => $index === 2,
            ])->assertCreated();
        }

        $context = $this->getJson(
            "/api/employees/{$ahmed->id}/payment-context?period=2026-09&kind=commission",
        )->assertOk()->json('data');

        $this->assertSame(8000.0, $this->money($context['already_paid_total']));
        $this->assertSame(0.0, $this->money($context['remaining']));

        // L'employe soldé quitte la liste des restes.
        $dues = $this->getJson('/api/wallet/employee-dues?period=2026-09')
            ->assertOk()->json('data');
        $this->assertSame(0, $dues['totals']['employees_remaining']);
    }
}
