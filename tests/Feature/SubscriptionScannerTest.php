<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\Employee;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\WorkDay;
use App\Services\SubscriptionService;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The 12 required scanner/rules scenarios — every path goes through the real
 * HTTP surface (GET scan card + POST validate) so permissions, the rule
 * engine, the prestation pipeline and the caisse integration are all covered.
 */
class SubscriptionScannerTest extends TestCase
{
    use RefreshDatabase;

    /** Wednesday, 11:00 in the salon timezone. */
    private const BASE_NOW = '2026-08-12 11:00:00';

    protected Client $client;

    protected Employee $employee;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        WorkDay::factory()->create(['status' => 'open']);
        Carbon::setTestNow(Carbon::parse(self::BASE_NOW, 'Africa/Casablanca'));

        $this->client = Client::factory()->create(['name' => 'Ahmed El Idrissi']);
        $this->employee = Employee::factory()->create(['name' => 'Karim']);
        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');
        Sanctum::actingAs($this->admin);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>  $planAttributes
     * @param  array<string, mixed>  $serviceAttributes
     */
    private function subscriptionFor(array $planAttributes = [], array $serviceAttributes = []): ClientSubscription
    {
        $service = Service::factory()->create(['name' => 'Hammam Turc', 'category' => 'hammam', 'price' => 150]);

        $plan = SubscriptionPlan::create(array_merge([
            'name' => 'Plan test '.uniqid(),
            'price' => 900,
            'duration_value' => 30,
            'duration_unit' => 'days',
            'is_active' => true,
            'allow_renewal' => true,
        ], $planAttributes));

        $plan->services()->create(array_merge([
            'service_id' => $service->id,
            'commission_basis' => 'none',
        ], $serviceAttributes));

        return app(SubscriptionService::class)
            ->purchase($this->client, $plan, $this->admin, ['payment_method' => 'especes'])
            ->fresh(['plan.services']);
    }

    private function validateVisit(ClientSubscription $subscription, ?int $planServiceId = null)
    {
        return $this->postJson('/api/subscriptions/scan/'.$subscription->qr_token.'/validate', [
            'subscription_plan_service_id' => $planServiceId ?? $subscription->plan->services->first()->id,
            'employee_id' => $this->employee->id,
        ]);
    }

    /** CAS 1 — 10 visites : la validation décrémente correctement. */
    public function test_limited_plan_decrements_remaining_visits(): void
    {
        $subscription = $this->subscriptionFor([], ['quota_total' => 10]);

        $response = $this->validateVisit($subscription)->assertOk();

        $this->assertSame(9, $response->json('data.remaining.total_remaining'));
        $this->assertDatabaseHas('client_subscription_usages', [
            'client_subscription_id' => $subscription->id,
            'status' => 'confirmed',
            'channel' => 'scanner',
            'employee_id' => $this->employee->id,
            'validated_by_user_id' => $this->admin->id,
        ]);
        // Caisse integration: a 0 DH sale marked "abonnement".
        $this->assertDatabaseHas('sales', [
            'id' => $response->json('data.sale_id'),
            'total' => 0,
            'payment_method' => 'abonnement',
        ]);
    }

    /** CAS 2 — illimité : visite enregistrée sans décrément. */
    public function test_unlimited_plan_records_visit_without_counter(): void
    {
        $subscription = $this->subscriptionFor();

        $response = $this->validateVisit($subscription)->assertOk();

        $this->assertNull($response->json('data.remaining.total_remaining'));
        $this->assertNull($response->json('data.remaining.period_remaining'));
        $this->assertSame(1, $subscription->usages()->where('status', 'confirmed')->count());
    }

    /** CAS 3 — abonnement expiré : refus explicite. */
    public function test_expired_subscription_is_refused(): void
    {
        $subscription = $this->subscriptionFor();
        $subscription->update(['ends_on' => Carbon::now('Africa/Casablanca')->subDay()->toDateString()]);

        $this->getJson('/api/subscriptions/scan/'.$subscription->qr_token)
            ->assertOk()
            ->assertJsonPath('data.usable', false);

        $this->validateVisit($subscription->fresh(['plan.services']))
            ->assertStatus(422)
            ->assertJsonFragment(['Abonnement expiré le '.Carbon::now('Africa/Casablanca')->subDay()->format('d/m/Y').'.']);
    }

    /** CAS 4 — plage 08:00-12:00, scan à 11:00 : autorisé. */
    public function test_morning_window_allows_visit_at_eleven(): void
    {
        $subscription = $this->subscriptionFor(['time_start' => '08:00', 'time_end' => '12:00']);

        $this->validateVisit($subscription)->assertOk();
    }

    /** CAS 5 — même plan, scan à 15:00 : refus. */
    public function test_morning_window_refuses_visit_at_fifteen(): void
    {
        $subscription = $this->subscriptionFor(['time_start' => '08:00', 'time_end' => '12:00']);
        Carbon::setTestNow(Carbon::parse('2026-08-12 15:00:00', 'Africa/Casablanca'));

        $this->validateVisit($subscription)
            ->assertStatus(422)
            ->assertJsonFragment(['Cet abonnement est valide uniquement entre 08:00 et 12:00.']);
    }

    /** CAS 6 — 1 visite/jour : le deuxième passage du jour est refusé. */
    public function test_daily_cap_refuses_second_visit_same_day(): void
    {
        $subscription = $this->subscriptionFor(['max_per_day' => 1]);

        $this->validateVisit($subscription)->assertOk();

        // Past the anti-double-scan window, same day.
        Carbon::setTestNow(Carbon::parse('2026-08-12 14:00:00', 'Africa/Casablanca'));

        $this->validateVisit($subscription)
            ->assertStatus(422)
            ->assertJsonFragment(['Limite journalière atteinte — 1 visite maximum par jour.']);
    }

    /** CAS 7 — 3 visites/semaine : la 4ᵉ est refusée. */
    public function test_weekly_cap_refuses_fourth_visit(): void
    {
        $subscription = $this->subscriptionFor(['max_per_week' => 3]);

        foreach ([1, 2, 3] as $attempt) {
            Carbon::setTestNow(Carbon::parse('2026-08-12 11:00:00', 'Africa/Casablanca')->addHours($attempt));
            $this->validateVisit($subscription)->assertOk();
        }

        Carbon::setTestNow(Carbon::parse('2026-08-13 11:00:00', 'Africa/Casablanca'));
        $this->validateVisit($subscription)
            ->assertStatus(422)
            ->assertJsonFragment(['Limite hebdomadaire atteinte — 3 visites maximum par semaine.']);
    }

    /** CAS 8 — service non inclus : refus. */
    public function test_service_not_included_is_refused(): void
    {
        $subscription = $this->subscriptionFor();
        $otherSubscription = $this->subscriptionFor();
        $foreignPlanService = $otherSubscription->plan->services->first();

        $this->validateVisit($subscription, $foreignPlanService->id)
            ->assertStatus(422)
            ->assertJsonFragment(['Ce service n’est pas inclus dans cet abonnement.']);
    }

    /** CAS 9 — double clic : une seule utilisation consommée. */
    public function test_double_click_consumes_a_single_visit(): void
    {
        $subscription = $this->subscriptionFor([], ['quota_total' => 10]);

        $this->validateVisit($subscription)->assertOk();
        $this->validateVisit($subscription)
            ->assertStatus(422)
            ->assertJsonFragment(['Une visite vient d’être enregistrée il y a moins de 2 minutes pour ce service.']);

        $this->assertSame(1, $subscription->usages()->whereIn('status', ['reserved', 'confirmed'])->count());
    }

    /** CAS 10 — intervalle minimum 6 h : deuxième passage trop tôt refusé. */
    public function test_min_interval_refuses_early_second_visit(): void
    {
        $subscription = $this->subscriptionFor(['min_interval_minutes' => 360]);

        $this->validateVisit($subscription)->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-08-12 13:00:00', 'Africa/Casablanca'));
        $tooEarly = $this->validateVisit($subscription)->assertStatus(422);
        $this->assertStringContainsString('Intervalle minimum', $tooEarly->json('message'));

        // 6h+ later the visit goes through.
        Carbon::setTestNow(Carbon::parse('2026-08-12 17:30:00', 'Africa/Casablanca'));
        $this->validateVisit($subscription)->assertOk();
    }

    /** CAS 11 — abonnement suspendu : refus. */
    public function test_suspended_subscription_is_refused(): void
    {
        $subscription = $this->subscriptionFor(['allow_suspension' => true]);
        app(SubscriptionService::class)->suspend(
            $subscription,
            Carbon::now('Africa/Casablanca'),
            Carbon::now('Africa/Casablanca')->addDays(10),
            'Voyage',
            $this->admin,
        );

        $refused = $this->validateVisit($subscription->fresh(['plan.services']))->assertStatus(422);
        $this->assertStringContainsString('Abonnement suspendu', $refused->json('message'));
    }

    /** CAS 12 — QR invalide : erreur propre. */
    public function test_invalid_token_returns_clean_error(): void
    {
        $this->getJson('/api/subscriptions/scan/jeton-inconnu-000')
            ->assertNotFound()
            ->assertJsonPath('message', 'QR code invalide ou révoqué.');

        $this->postJson('/api/subscriptions/scan/jeton-inconnu-000/validate', [
            'subscription_plan_service_id' => 1,
            'employee_id' => $this->employee->id,
        ])->assertNotFound();
    }

    /** Jour non autorisé (lundi/mardi uniquement, scan un mercredi) : refus. */
    public function test_disallowed_day_is_refused(): void
    {
        $subscription = $this->subscriptionFor(['allowed_days' => [1, 2]]);

        $refused = $this->validateVisit($subscription)->assertStatus(422);
        $this->assertStringContainsString('Jours autorisés : lundi, mardi', $refused->json('message'));
    }

    /** Commission : la visite validée crédite l'employé selon la règle du plan. */
    public function test_validated_visit_creates_commission_from_plan_basis(): void
    {
        $subscription = $this->subscriptionFor([], [
            'commission_basis' => 'fixed',
            'commission_value' => 20,
        ]);

        $response = $this->validateVisit($subscription)->assertOk();

        $this->assertDatabaseHas('commissions', [
            'prestation_id' => $response->json('data.prestation_id'),
            'employee_id' => $this->employee->id,
            'amount' => 20,
            'status' => 'validated',
        ]);
        $this->assertDatabaseHas('sales', [
            'id' => $response->json('data.sale_id'),
            'commission_amount' => 20,
        ]);
    }

    /** L'employé sans permission subscriptions.use ne peut pas scanner. */
    public function test_employee_role_cannot_scan(): void
    {
        $subscription = $this->subscriptionFor();

        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');
        Sanctum::actingAs($employeeUser);

        $this->getJson('/api/subscriptions/scan/'.$subscription->qr_token)->assertForbidden();
    }
}
