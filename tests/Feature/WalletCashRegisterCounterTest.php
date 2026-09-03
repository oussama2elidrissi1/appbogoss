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
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Le compteur « Résultats de caisse reçus » — sa définition exacte.
 *
 * Il somme tout l'argent venu de la caisse et RIEN d'autre : les crédits de
 * clôture, plus les corrections marquées `cash_register_correction` (la
 * réattribution d'un crédit mal placé et sa contre-passe). Un ajustement
 * manuel ordinaire n'y entre jamais, et chaque journée n'y compte qu'une
 * seule fois dans tout le système.
 *
 * Le scénario de référence est celui observé en production : le 01/09/2026
 * (1 548 DH) réattribué depuis le portefeuille du patron, le 02/09/2026
 * (3 130 DH) crédité normalement — le compteur de l'admin doit dire 4 678 DH,
 * pas 3 130.
 */
class WalletCashRegisterCounterTest extends TestCase
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

    private function walletOf(User $user): Wallet
    {
        return app(WalletService::class)->walletFor($user);
    }

    /** @return array<string, mixed> */
    private function summaryOf(User $user): array
    {
        return app(WalletService::class)->summary($this->walletOf($user));
    }

    /** Une journée clôturée par le flux normal : le crédit part tout seul. */
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

    /**
     * L'état laissé par l'ancienne règle d'attribution : la journée est
     * clôturée par l'admin, mais son crédit est dans le portefeuille du
     * patron. C'est ce que `--repair-owners` répare par une réattribution.
     */
    private function misplacedCredit(User $superAdmin, User $admin, string $date, float $amount): WorkDay
    {
        $employee = Employee::factory()->create();

        $day = WorkDay::factory()->create([
            'date' => $date,
            'opened_by_user_id' => $superAdmin->id,
            'opening_balance' => 0,
            'status' => 'closed',
            'closed_at' => $date.' 22:00:00',
            'closing_report' => ['net_result' => $amount, 'revenue_total' => $amount],
        ]);

        Sale::create([
            'work_day_id' => $day->id,
            'client_label' => 'Client',
            'employee_id' => $employee->id,
            'category' => 'coiffure',
            'total' => $amount,
            'payment_method' => 'especes',
        ]);

        $wallet = $this->walletOf($superAdmin);
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
            'description' => 'Resultat de la caisse du '.$day->date->format('d/m/Y'),
            'occurred_at' => $date.' 00:00:00',
        ]);

        return $day;
    }

    // =====================================================================
    // 1. Un résultat de caisse normal alimente le compteur
    // =====================================================================

    public function test_a_normal_cash_register_result_feeds_the_counter(): void
    {
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-02', 3130, $admin);

        $summary = $this->summaryOf($admin);

        $this->assertSame(3130.0, $summary['cash_registers_total']);
        $this->assertSame(0.0, $summary['adjustments_total']);
    }

    // =====================================================================
    // 2. Un résultat réattribué reste un résultat de caisse
    // =====================================================================

    public function test_a_reattributed_result_keeps_counting_as_cash_register(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $day = $this->misplacedCredit($superAdmin, $admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days --repair-owners')->assertSuccessful();

        // Chez l'admin : compté avec la caisse, pas avec les ajustements.
        $summary = $this->summaryOf($admin);
        $this->assertSame(1548.0, $summary['cash_registers_total']);
        $this->assertSame(0.0, $summary['adjustments_total']);

        // Chez le patron : la journée est rendue — son compteur retombe à
        // zéro, sinon elle serait comptée des deux côtés à la fois.
        $patron = $this->summaryOf($superAdmin);
        $this->assertSame(0.0, $patron['cash_registers_total']);
        $this->assertSame(0.0, $patron['adjustments_total']);

        // Le crédit de réattribution est identifiable : marqué, lié à SA
        // journée, daté du jour de caisse — pas du jour de la réparation.
        $credit = WalletTransaction::where('wallet_id', $this->walletOf($admin)->id)->sole();
        $this->assertSame(WalletTransaction::TYPE_ADJUSTMENT, $credit->type);
        $this->assertSame(WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION, $credit->category);
        $this->assertSame($day->id, (int) $credit->source_id);
        $this->assertSame('2026-09-01', $credit->occurred_at->toDateString());

        // Et la journée elle-même raconte où est parti son résultat.
        $status = app(WalletService::class)->workDayStatus($day->fresh());
        $this->assertSame('reattributed', $status['status']);
        $this->assertSame('Admin BOGOSLAND', $status['wallet_owner']);
        $this->assertSame(1548.0, round((float) $status['amount'], 2));
    }

    // =====================================================================
    // 3. Un ajustement manuel n'entre jamais dans le compteur
    // =====================================================================

    public function test_a_manual_adjustment_never_feeds_the_cash_register_counter(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->closeDayWithResult('2026-09-02', 3130, $admin);

        app(WalletService::class)->adjust(
            $this->walletOf($admin),
            500,
            'Correction d\'inventaire',
            $superAdmin,
        );

        $summary = $this->summaryOf($admin);

        $this->assertSame(3130.0, $summary['cash_registers_total']);
        $this->assertSame(500.0, $summary['adjustments_total']);
    }

    // =====================================================================
    // 4. Une journée ne peut être comptée qu'une seule fois
    // =====================================================================

    public function test_a_work_day_cannot_be_reattributed_twice(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $this->misplacedCredit($superAdmin, $admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days --repair-owners')->assertSuccessful();
        $this->assertSame(3, WalletTransaction::count());

        // Rejouer la commande ne réécrit rien.
        $this->artisan('wallet:sync-closed-days --repair-owners')
            ->expectsOutputToContain('déjà contre-passé')
            ->expectsOutputToContain('0 crédit(s) réattribué(s).')
            ->assertSuccessful();
        $this->assertSame(3, WalletTransaction::count());

        // Rejouer le service échoue proprement : le crédit d'origine est
        // déjà contre-passé, il n'y a plus rien à déplacer.
        $original = WalletTransaction::where('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)->sole();

        try {
            app(WalletService::class)->reattributeWorkDayResult($original, $admin, $superAdmin);
            $this->fail('Une seconde réattribution aurait dû être refusée.');
        } catch (ValidationException $exception) {
            $this->assertStringContainsString(
                'contre-passé',
                implode(' ', $exception->errors()['transaction'] ?? []),
            );
        }

        // Et le compteur n'a pas bougé : la journée compte UNE fois.
        $this->assertSame(3, WalletTransaction::count());
        $this->assertSame(1548.0, $this->summaryOf($admin)['cash_registers_total']);
        $this->assertSame(0.0, $this->summaryOf($superAdmin)['cash_registers_total']);
    }

    public function test_the_database_refuses_a_second_reattribution_row_for_the_same_day(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $day = $this->misplacedCredit($superAdmin, $admin, '2026-09-01', 1548);

        $this->artisan('wallet:sync-closed-days --repair-owners')->assertSuccessful();

        // Même en contournant le service, l'index unique (source, type)
        // interdit une seconde ligne de réattribution pour cette journée.
        $this->expectException(QueryException::class);

        WalletTransaction::create([
            'wallet_id' => $this->walletOf($superAdmin)->id,
            'type' => WalletTransaction::TYPE_ADJUSTMENT,
            'direction' => WalletTransaction::DIRECTION_IN,
            'bucket' => WalletTransaction::BUCKET_AVAILABLE,
            'amount' => 1548,
            'balance_after' => 1548,
            'cash_fund_after' => 0,
            'category' => WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION,
            'source_type' => $day->getMorphClass(),
            'source_id' => $day->id,
            'description' => 'Tentative de double réattribution',
            'occurred_at' => '2026-09-01 00:00:00',
        ]);
    }

    // =====================================================================
    // 5. Le scénario de septembre 2026, de bout en bout
    // =====================================================================

    public function test_september_counter_totals_normal_and_reattributed_results(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();

        // 01/09 : 1 548 DH crédités à tort chez le patron, puis réattribués.
        $this->misplacedCredit($superAdmin, $admin, '2026-09-01', 1548);
        $this->artisan('wallet:sync-closed-days --repair-owners')->assertSuccessful();

        // 02/09 : 3 130 DH crédités normalement à la clôture.
        $this->closeDayWithResult('2026-09-02', 3130, $admin);

        $this->assertSame(4678.0, $this->summaryOf($admin)['cash_registers_total']);

        // Le même chiffre à travers l'API que lit l'écran Portefeuille.
        Sanctum::actingAs($admin);
        $this->getJson('/api/wallet')
            ->assertOk()
            ->assertJsonPath('data.cash_registers_total', fn ($value) => round((float) $value, 2) === 4678.0)
            ->assertJsonPath('data.reconciliation.balanced', true);
    }

    /**
     * Le même scénario, mais avec les lignes telles que l'ANCIENNE réparation
     * les a réellement écrites en base : un ajustement sans marqueur ni lien.
     * C'est la migration de rattrapage qui doit les rendre comptables — et
     * amener le compteur de 3 130 à 4 678.
     */
    public function test_the_migration_tags_legacy_reattributions_and_fixes_the_counter(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();
        $day = $this->misplacedCredit($superAdmin, $admin, '2026-09-01', 1548);
        $original = WalletTransaction::where('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)->sole();

        // La contre-passe et la réattribution, à l'ancienne : type ADJUSTMENT
        // nu, aucune catégorie, aucun lien vers la journée.
        $patronWallet = $this->walletOf($superAdmin);
        $patronWallet->forceFill(['balance' => '0.00'])->save();
        WalletTransaction::create([
            'wallet_id' => $patronWallet->id,
            'type' => WalletTransaction::TYPE_ADJUSTMENT,
            'direction' => WalletTransaction::DIRECTION_OUT,
            'bucket' => WalletTransaction::BUCKET_AVAILABLE,
            'amount' => 1548,
            'balance_after' => 0,
            'cash_fund_after' => 0,
            'performed_by_user_id' => $superAdmin->id,
            'reverses_transaction_id' => $original->id,
            'description' => 'Résultat de caisse crédité au portefeuille du patron par erreur — annulation du mouvement #'.$original->id,
            'occurred_at' => '2026-09-10 09:00:00',
        ]);

        $adminWallet = $this->walletOf($admin);
        $adminWallet->forceFill(['balance' => '1548.00'])->save();
        WalletTransaction::create([
            'wallet_id' => $adminWallet->id,
            'type' => WalletTransaction::TYPE_ADJUSTMENT,
            'direction' => WalletTransaction::DIRECTION_IN,
            'bucket' => WalletTransaction::BUCKET_AVAILABLE,
            'amount' => 1548,
            'balance_after' => 1548,
            'cash_fund_after' => 0,
            'performed_by_user_id' => $superAdmin->id,
            'description' => 'Réattribution du résultat de caisse du 01/09/2026 (crédité à tort au portefeuille du patron)',
            'occurred_at' => '2026-09-10 09:00:00',
        ]);

        // 02/09 : 3 130 DH crédités normalement — l'écran n'affichait qu'eux.
        $this->closeDayWithResult('2026-09-02', 3130, $admin);
        $this->assertSame(3130.0, $this->summaryOf($admin)['cash_registers_total']);

        $migration = include database_path(
            'migrations/2026_09_03_100000_tag_cash_register_corrections_in_wallet_transactions.php',
        );
        $migration->up();

        // 1 548 réattribués + 3 130 normaux = 4 678, et plus un centime chez
        // le patron ni dans les ajustements ordinaires.
        $this->assertSame(4678.0, $this->summaryOf($admin)['cash_registers_total']);
        $this->assertSame(0.0, $this->summaryOf($admin)['adjustments_total']);
        $this->assertSame(0.0, $this->summaryOf($superAdmin)['cash_registers_total']);
        $this->assertSame(0.0, $this->summaryOf($superAdmin)['adjustments_total']);

        // La réattribution est maintenant reliée à sa journée : le verrou
        // anti-double-comptage la couvre, et la journée dit où est l'argent.
        $tagged = WalletTransaction::where('wallet_id', $adminWallet->id)
            ->where('type', WalletTransaction::TYPE_ADJUSTMENT)
            ->sole();
        $this->assertSame(WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION, $tagged->category);
        $this->assertSame($day->id, (int) $tagged->source_id);
        $this->assertSame('reattributed', app(WalletService::class)->workDayStatus($day->fresh())['status']);
    }
}
