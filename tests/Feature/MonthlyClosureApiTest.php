<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Advance;
use App\Models\AppSetting;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\MonthlyClosure;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\MonthlyClosureService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Clôture mensuelle.
 *
 * Toute la suite se place au 15 septembre 2026 : août est donc un mois
 * terminé, septembre le mois courant. Le mois de démarrage est forcé à
 * 2026-07 — la migration l'initialise au mois d'activation, ce qui, sous
 * `RefreshDatabase`, vaudrait le mois courant et exclurait août des tests.
 */
class MonthlyClosureApiTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-15 10:00:00';

    private const CLOSABLE = '2026-08';

    private const CURRENT = '2026-09';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->travelTo(self::NOW);
        AppSetting::updateOrCreate(
            ['key' => MonthlyClosureService::START_PERIOD_KEY],
            ['value' => '2026-07'],
        );
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    protected function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    /** Un compte sans aucune permission de clôture. */
    protected function employeeUser(): User
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        return $user;
    }

    /** Commission validée pour cet employé, datée dans le mois voulu. */
    protected function makeCommission(Employee $employee, User $author, float $amount, string $onDate): void
    {
        $service = Service::factory()->create();
        $prestation = Prestation::create([
            'reference' => 'PRE-CLO-'.uniqid(),
            'employee_id' => $employee->id,
            'created_by_user_id' => $author->id,
            'status' => Prestation::STATUS_PAID,
            'total' => $amount * 2,
        ]);
        $prestation->created_at = $onDate;
        $prestation->save();

        $item = PrestationItem::create([
            'prestation_id' => $prestation->id,
            'service_id' => $service->id,
            'label' => $service->name,
            'quantity' => 1,
            'unit_price' => $amount * 2,
            'commission_amount' => $amount,
        ]);

        $commission = Commission::create([
            'prestation_id' => $prestation->id,
            'prestation_item_id' => $item->id,
            'employee_id' => $employee->id,
            'service_id' => $service->id,
            'type' => 'fixed',
            'rate_or_amount' => $amount,
            'base_amount' => $amount * 2,
            'amount' => $amount,
            'status' => Commission::STATUS_VALIDATED,
        ]);
        $commission->created_at = $onDate;
        $commission->save();
    }

    protected function closedDay(string $date): WorkDay
    {
        return WorkDay::create([
            'date' => $date,
            'opening_balance' => 0,
            'status' => 'closed',
            'closed_at' => $date.' 22:00:00',
        ]);
    }

    protected function openDay(string $date): WorkDay
    {
        return WorkDay::create(['date' => $date, 'opening_balance' => 0, 'status' => 'open']);
    }

    /** Clôture août directement par le service — raccourci des tests de verrou. */
    protected function closeAugust(): MonthlyClosure
    {
        return app(MonthlyClosureService::class)->close(self::CLOSABLE, $this->admin());
    }

    // -----------------------------------------------------------------
    // Périodes
    // -----------------------------------------------------------------

    public function test_current_period_is_derived_from_the_date_not_from_a_record(): void
    {
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/periods')->assertOk();

        // Aucune ligne n'a été créée pour « ouvrir » septembre : le mois
        // courant se déduit de la date, comme partout ailleurs.
        $this->assertSame(self::CURRENT, $response->json('data.current'));
        $this->assertSame(0, MonthlyClosure::count());
    }

    public function test_finished_month_is_listed_as_to_finalize(): void
    {
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/periods')->assertOk();

        $this->assertContains(self::CLOSABLE, array_column($response->json('data.to_finalize'), 'period'));
    }

    public function test_several_unclosed_months_are_all_listed(): void
    {
        Sanctum::actingAs($this->admin());

        $periods = array_column($this->getJson('/api/periods')->json('data.to_finalize'), 'period');

        // Rien n'oblige à finaliser juillet avant que septembre n'arrive.
        $this->assertSame(['2026-08', '2026-07'], $periods);
    }

    public function test_months_before_the_start_period_are_ignored(): void
    {
        AppSetting::updateOrCreate(
            ['key' => MonthlyClosureService::START_PERIOD_KEY],
            ['value' => '2026-08'],
        );
        Sanctum::actingAs($this->admin());

        $periods = array_column($this->getJson('/api/periods')->json('data.to_finalize'), 'period');

        $this->assertSame(['2026-08'], $periods);
        $this->assertNotContains('2026-07', $periods);
    }

    public function test_current_month_keeps_working_while_a_previous_month_stays_open(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 100, '2026-09-05');
        Sanctum::actingAs($admin);

        // Août est encore à finaliser, ce qui ne gêne en rien septembre.
        $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => self::CURRENT,
        ])->assertCreated();
    }

    public function test_september_counters_start_at_zero_without_any_reset(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 400, '2026-08-10');
        Sanctum::actingAs($admin);

        $september = $this->getJson('/api/commission-payouts?period='.self::CURRENT)->assertOk();
        $august = $this->getJson('/api/commission-payouts?period='.self::CLOSABLE)->assertOk();

        // Le zéro de septembre vient du filtrage, pas d'une remise à zéro :
        // les données d'août sont intactes.
        $this->assertEquals(0.0, $september->json('data.0.commission_total'));
        $this->assertEquals(400.0, $august->json('data.0.commission_total'));
    }

    public function test_a_previous_month_still_accepts_payments_before_closing(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 250, '2026-08-12');
        Sanctum::actingAs($admin);

        $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => self::CLOSABLE,
        ])->assertCreated();
    }

    // -----------------------------------------------------------------
    // Checklist
    // -----------------------------------------------------------------

    public function test_checklist_lists_an_employee_with_commission_as_not_settled(): void
    {
        $employee = Employee::factory()->create(['name' => 'Karim']);
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 450, '2026-08-10');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();

        $row = $response->json('data.employees.0');
        $this->assertSame('Karim', $row['employee_name']);
        $this->assertEquals(450.0, $row['earned']);
        $this->assertEquals(450.0, $row['remaining_to_pay']);
        $this->assertFalse($row['settled']);
        $this->assertFalse($response->json('data.can_close'));
    }

    public function test_checklist_shows_the_remainder_after_a_partial_payment(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 300, '2026-08-05');
        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => self::CLOSABLE]);

        // Le salarié revient travailler et gagne encore après avoir été payé.
        $this->makeCommission($employee, $admin, 120, '2026-08-20');

        $row = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->json('data.employees.0');
        $this->assertEquals(420.0, $row['earned']);
        $this->assertEquals(300.0, $row['payouts_total']);
        $this->assertEquals(120.0, $row['remaining_to_pay']);
        $this->assertFalse($row['settled']);
    }

    public function test_checklist_marks_a_fully_paid_employee_as_settled(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 300, '2026-08-05');
        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => self::CLOSABLE]);

        $row = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->json('data.employees.0');
        $this->assertTrue($row['settled']);
        $this->assertEquals(0.0, $row['remaining_to_pay']);
    }

    public function test_an_advance_larger_than_the_commission_settles_and_carries_forward(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 100, '2026-08-05');
        Advance::create([
            'employee_id' => $employee->id,
            'amount' => 400,
            'given_on' => '2026-08-06',
        ]);
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();
        $row = $response->json('data.employees.0');

        // Décision métier conservée : l'employé n'a plus rien à recevoir, le
        // reliquat d'avance se reporte, et cela NE bloque PAS la clôture.
        $this->assertTrue($row['settled']);
        $this->assertEquals(0.0, $row['remaining_to_pay']);
        $this->assertEquals(400.0, $row['carry_forward_advance']);
        $this->assertTrue($response->json('data.can_close'));
    }

    public function test_an_employee_with_only_an_outstanding_advance_still_appears(): void
    {
        $employee = Employee::factory()->create(['name' => 'Sans commission']);
        Advance::create([
            'employee_id' => $employee->id,
            'amount' => 200,
            'given_on' => '2026-08-03',
        ]);
        Sanctum::actingAs($this->admin());

        $names = array_column(
            $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->json('data.employees'),
            'employee_name',
        );

        // « Employés concernés » ne se limite pas à commission > 0 : une
        // avance qui entre dans le calcul de la paie du mois compte aussi.
        $this->assertContains('Sans commission', $names);
    }

    public function test_an_open_cash_day_blocks_the_closure(): void
    {
        $this->closedDay('2026-08-30');
        $this->openDay('2026-08-31');
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();

        $this->assertFalse($response->json('data.can_close'));
        $this->assertSame(1, $response->json('data.work_days.open'));
        $this->assertSame('2026-08-31', $response->json('data.work_days.open_days.0.date'));
        $this->assertContains(
            'Impossible de clôturer : 1 journée de caisse est encore ouverte.',
            $response->json('data.blocking_reasons'),
        );
    }

    public function test_all_cash_days_closed_allows_the_closure(): void
    {
        $this->closedDay('2026-08-30');
        $this->closedDay('2026-08-31');
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();

        $this->assertTrue($response->json('data.work_days.all_closed'));
        $this->assertTrue($response->json('data.can_close'));
    }

    public function test_a_cash_day_of_another_month_never_blocks(): void
    {
        $this->openDay('2026-09-14');
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();

        $this->assertSame(0, $response->json('data.work_days.total'));
        $this->assertTrue($response->json('data.can_close'));
    }

    public function test_partner_commissions_are_informational_and_never_block(): void
    {
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertOk();

        $this->assertTrue($response->json('data.partner_information.informational'));
        $this->assertTrue($response->json('data.can_close'));
    }

    // -----------------------------------------------------------------
    // Clôture
    // -----------------------------------------------------------------

    public function test_the_current_month_can_never_be_closed(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/monthly-closures', ['period' => self::CURRENT, 'confirmed' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.period.0', 'Le mois courant ne peut pas être clôturé.');

        $this->assertSame(0, MonthlyClosure::count());
    }

    public function test_closing_requires_the_confirmation_flag(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => false])
            ->assertStatus(422)
            ->assertJsonValidationErrors('confirmed');

        $this->assertSame(0, MonthlyClosure::count());
    }

    public function test_closing_is_refused_while_an_employee_is_unsettled(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 450, '2026-08-10');
        Sanctum::actingAs($admin);

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.period.0', 'Impossible de clôturer : 1 employé n\'est pas soldé.');

        $this->assertSame(0, MonthlyClosure::count());
    }

    public function test_closing_is_refused_while_a_cash_day_is_open(): void
    {
        $this->openDay('2026-08-31');
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.period.0', 'Impossible de clôturer : 1 journée de caisse est encore ouverte.');
    }

    public function test_closing_succeeds_and_freezes_a_complete_snapshot(): void
    {
        $employee = Employee::factory()->create(['name' => 'Yassine']);
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 300, '2026-08-05');
        $this->closedDay('2026-08-31');
        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => self::CLOSABLE]);

        $response = $this->postJson('/api/monthly-closures', [
            'period' => self::CLOSABLE,
            'confirmed' => true,
            'notes' => 'Vérifié avec le patron.',
        ])->assertCreated();

        $closure = MonthlyClosure::where('period', self::CLOSABLE)->firstOrFail();
        $this->assertSame($admin->id, $closure->closed_by_user_id);
        $this->assertNotNull($closure->closed_at);
        $this->assertSame('Vérifié avec le patron.', $closure->notes);

        $report = $closure->closing_report;
        $this->assertSame(self::CLOSABLE, $report['period']);
        $this->assertSame($admin->name, $report['closed_by']['name']);
        $this->assertSame('Yassine', $report['employees'][0]['employee_name']);
        $this->assertEquals(300.0, $report['employees'][0]['earned']);
        $this->assertTrue($report['employees'][0]['settled']);
        $this->assertSame(1, $report['work_days']['total']);
        $this->assertTrue($report['work_days']['all_closed']);
        $this->assertEquals(300.0, $report['totals']['commission_total']);
        $this->assertSame(1, $report['totals']['employees_count']);

        $this->assertSame($admin->name, $response->json('data.closed_by'));
        $this->assertSame('closed', $response->json('data.status'));

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'monthly_closure.closed',
            'subject_id' => $closure->id,
        ]);
    }

    public function test_a_month_cannot_be_closed_twice(): void
    {
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])
            ->assertStatus(422)
            ->assertJsonPath('errors.period.0', 'Ce mois est déjà clôturé.');

        $this->assertSame(1, MonthlyClosure::where('period', self::CLOSABLE)->count());
    }

    public function test_two_concurrent_closures_produce_exactly_one_row(): void
    {
        $service = app(MonthlyClosureService::class);
        $admin = $this->admin();

        $service->close(self::CLOSABLE, $admin);

        // La seconde demande arrive derrière la première : réponse métier
        // propre, jamais une erreur SQL, et une seule clôture en base.
        try {
            $service->close(self::CLOSABLE, $admin);
            $this->fail('La seconde clôture aurait dû être refusée.');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertSame('Ce mois est déjà clôturé.', $exception->errors()['period'][0]);
        }

        $this->assertSame(1, MonthlyClosure::where('period', self::CLOSABLE)->count());
    }

    public function test_a_closed_month_leaves_the_pending_list(): void
    {
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/periods')->assertOk();

        $this->assertNotContains(self::CLOSABLE, array_column($response->json('data.to_finalize'), 'period'));
        $this->assertContains(self::CLOSABLE, array_column($response->json('data.closed'), 'period'));
    }

    public function test_closing_august_does_not_disturb_september(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 180, '2026-09-08');
        $this->closeAugust();
        Sanctum::actingAs($admin);

        $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => self::CURRENT,
        ])->assertCreated();
    }

    // -----------------------------------------------------------------
    // Verrous serveur d'un mois clôturé
    // -----------------------------------------------------------------

    public function test_a_backdated_advance_into_a_closed_month_is_refused(): void
    {
        $employee = Employee::factory()->create();
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/advances', [
            'employee_id' => $employee->id,
            'amount' => 100,
            'given_on' => '2026-08-20',
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.period.0', 'Cette période est clôturée et ne peut plus être modifiée.');

        $this->assertSame(0, Advance::count());
    }

    public function test_an_advance_of_a_closed_month_cannot_be_edited(): void
    {
        $employee = Employee::factory()->create();
        $advance = Advance::create([
            'employee_id' => $employee->id,
            'amount' => 100,
            'given_on' => '2026-08-20',
        ]);
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        $this->putJson('/api/advances/'.$advance->id, ['amount' => 999])->assertStatus(422);

        $this->assertSame('100.00', $advance->fresh()->amount);
    }

    public function test_an_advance_cannot_be_moved_into_a_closed_month(): void
    {
        $employee = Employee::factory()->create();
        $advance = Advance::create([
            'employee_id' => $employee->id,
            'amount' => 100,
            'given_on' => '2026-09-10',
        ]);
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        // La donnée appartient à septembre — c'est la DESTINATION qui est
        // clôturée, et le middleware lit les deux côtés.
        $this->putJson('/api/advances/'.$advance->id, ['given_on' => '2026-08-15'])->assertStatus(422);

        $this->assertSame('2026-09-10', $advance->fresh()->given_on->toDateString());
    }

    public function test_an_expense_cannot_be_created_in_a_closed_month(): void
    {
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/expenses', [
            'label' => 'Achat tardif',
            'category' => 'Divers',
            'amount' => 60,
            'spent_on' => '2026-08-28',
        ])->assertStatus(422);

        $this->assertSame(0, Expense::count());
    }

    public function test_an_expense_of_a_closed_month_cannot_be_edited(): void
    {
        $expense = Expense::create([
            'label' => 'Produits',
            'category' => 'Stock',
            'amount' => 200,
            'spent_on' => '2026-08-12',
        ]);
        $this->closeAugust();
        Sanctum::actingAs($this->superAdmin());

        $this->putJson('/api/expenses/'.$expense->id, ['amount' => 999])->assertStatus(422);

        $this->assertSame('200.00', $expense->fresh()->amount);
    }

    public function test_an_expense_cannot_be_moved_into_a_closed_month(): void
    {
        $expense = Expense::create([
            'label' => 'Produits',
            'category' => 'Stock',
            'amount' => 200,
            'spent_on' => '2026-09-12',
        ]);
        $this->closeAugust();
        Sanctum::actingAs($this->superAdmin());

        $this->putJson('/api/expenses/'.$expense->id, ['spent_on' => '2026-08-12'])->assertStatus(422);

        $this->assertSame('2026-09-12', $expense->fresh()->spent_on->toDateString());
    }

    public function test_a_payout_cannot_be_recorded_on_a_closed_month(): void
    {
        $employee = Employee::factory()->create();
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 300, '2026-08-05');
        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => self::CLOSABLE]);
        $this->closeAugust();

        // Un versement supplémentaire sur un mois clôturé est refusé même si
        // l'employé a regagné de la commission entre-temps.
        $this->makeCommission($employee, $admin, 90, '2026-08-25');
        $this->postJson('/api/commission-payouts', [
            'employee_id' => $employee->id,
            'period' => self::CLOSABLE,
        ])->assertStatus(422);
    }

    public function test_an_open_month_keeps_accepting_advances_and_expenses(): void
    {
        $employee = Employee::factory()->create();
        Sanctum::actingAs($this->admin());

        // Août reste ouvert : les corrections nécessaires à sa finalisation
        // restent possibles, c'est tout l'objet du délai avant clôture.
        $this->postJson('/api/advances', [
            'employee_id' => $employee->id,
            'amount' => 100,
            'given_on' => '2026-08-20',
        ])->assertCreated();

        $this->postJson('/api/expenses', [
            'label' => 'Régularisation',
            'category' => 'Divers',
            'amount' => 60,
            'spent_on' => '2026-08-28',
        ])->assertCreated();
    }

    // -----------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------

    public function test_an_admin_can_close_a_month(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])
            ->assertCreated();
    }

    public function test_a_user_without_months_close_is_refused(): void
    {
        Sanctum::actingAs($this->employeeUser());

        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])
            ->assertForbidden();
        $this->getJson('/api/monthly-closures/'.self::CLOSABLE.'/checklist')->assertForbidden();
    }

    public function test_an_admin_cannot_read_the_closure_history(): void
    {
        $this->closeAugust();
        Sanctum::actingAs($this->admin());

        // Un mois clôturé quitte définitivement les écrans de l'admin.
        $this->getJson('/api/monthly-closures')->assertForbidden();
        $this->getJson('/api/monthly-closures/'.self::CLOSABLE)->assertForbidden();
    }

    public function test_a_super_admin_reads_the_closure_history(): void
    {
        $employee = Employee::factory()->create(['name' => 'Yassine']);
        $admin = $this->admin();
        $this->makeCommission($employee, $admin, 300, '2026-08-05');
        Sanctum::actingAs($admin);
        $this->postJson('/api/commission-payouts', ['employee_id' => $employee->id, 'period' => self::CLOSABLE]);
        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true]);

        Sanctum::actingAs($this->superAdmin());
        $index = $this->getJson('/api/monthly-closures')->assertOk();

        $this->assertSame(self::CLOSABLE, $index->json('data.0.period'));
        $this->assertSame($admin->name, $index->json('data.0.closed_by'));
        $this->assertSame(1, $index->json('data.0.employees_count'));
        $this->assertEquals(300.0, $index->json('data.0.commission_total'));

        $detail = $this->getJson('/api/monthly-closures/'.self::CLOSABLE)->assertOk();
        $this->assertSame('Yassine', $detail->json('data.closing_report.employees.0.employee_name'));
    }

    public function test_activity_log_records_who_closed_the_month(): void
    {
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $this->postJson('/api/monthly-closures', ['period' => self::CLOSABLE, 'confirmed' => true])->assertCreated();

        $log = ActivityLog::where('action', 'monthly_closure.closed')->firstOrFail();
        $this->assertSame(self::CLOSABLE, $log->new_values['period']);
        $this->assertSame(MonthlyClosure::class, $log->subject_type);

        // L'autorite sur « qui a cloture » est la colonne closed_by_user_id :
        // ActivityLogger lit Auth::guard('web'), vide sous un jeton Sanctum.
        $this->assertSame($admin->id, MonthlyClosure::where('period', self::CLOSABLE)->value('closed_by_user_id'));
    }
}
