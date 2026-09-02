<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\Service;
use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Le compte de validation Google Play.
 *
 * Ce que cette suite protège : un compte que Google manipule librement dans
 * l'app mobile, qui voit une interface employé normale, qui peut composer des
 * prestations de démonstration — et qui ne peut RIEN casser. Toutes les
 * interdictions sont vérifiées ici contre l'API Laravel directement : masquer
 * des boutons côté Flutter ne compte pas.
 */
class GoogleReviewerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    // ------------------------------------------------------------------
    // Fabriques
    // ------------------------------------------------------------------

    /** Le compte reviewer, exactement comme `reviewer:setup` le construit. */
    private function reviewer(): User
    {
        putenv('GOOGLE_REVIEWER_EMAIL=google.review@bogosland.com');
        Artisan::call('reviewer:setup', ['--password' => 'secret-review-123']);

        return User::query()->where('email', 'google.review@bogosland.com')->firstOrFail();
    }

    private function actingAsReviewer(): User
    {
        $user = $this->reviewer();
        Sanctum::actingAs($user);

        return $user;
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    private function realEmployee(): Employee
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');

        return Employee::factory()->create(['user_id' => $user->id, 'name' => 'Vrai Employé']);
    }

    private function service(): Service
    {
        return Service::factory()->create(['name' => 'Coupe démo', 'price' => 100]);
    }

    /**
     * Composer une prestation exige une journée ouverte — pour le reviewer
     * comme pour un vrai employé : aucun circuit parallèle n'a été créé.
     */
    private function openDay(): WorkDay
    {
        return WorkDay::query()->where('status', 'open')->first()
            ?? WorkDay::factory()->create(['date' => now()->toDateString(), 'status' => 'open']);
    }

    /** Une prestation de démonstration complète, créée VIA L'API par le reviewer. */
    private function reviewerPrestation(): Prestation
    {
        $this->openDay();

        $response = $this->postJson('/api/prestations', [
            'client_label' => 'Client de test Google',
            'items' => [['service_id' => $this->service()->id]],
        ]);
        $response->assertCreated();

        return Prestation::query()->findOrFail($response->json('data.id'));
    }

    // ------------------------------------------------------------------
    // 1. Le compte : création, connexion, identité par rôle
    // ------------------------------------------------------------------

    public function test_reviewer_setup_creates_role_based_account_with_demo_employee(): void
    {
        $user = $this->reviewer();

        $this->assertTrue($user->hasRole('google_reviewer'));
        $this->assertSame([], $user->getAllPermissions()->pluck('name')->all(),
            'Le rôle google_reviewer ne doit porter AUCUNE permission nommée.');
        $this->assertNotNull($user->employee);
        $this->assertTrue($user->employee->is_demo);
        $this->assertSame('Google Play Reviewer', $user->employee->name);
    }

    public function test_reviewer_setup_is_idempotent(): void
    {
        $this->reviewer();
        Artisan::call('reviewer:setup', ['--password' => 'autre-mot-de-passe']);

        $this->assertSame(1, User::query()->where('email', 'google.review@bogosland.com')->count());
        $this->assertSame(1, Employee::query()->where('is_demo', true)->count());

        $user = User::query()->where('email', 'google.review@bogosland.com')->firstOrFail();
        $this->assertTrue(Hash::check('autre-mot-de-passe', $user->password),
            'Relancer reviewer:setup réinitialise le mot de passe.');
    }

    public function test_reviewer_can_login_on_mobile_endpoint(): void
    {
        $this->reviewer();

        $response = $this->postJson('/api/mobile/login', [
            'email' => 'google.review@bogosland.com',
            'password' => 'secret-review-123',
            'device_name' => 'google-review-device',
        ]);

        $response->assertOk();
        $this->assertNotEmpty($response->json('token'));
        $this->assertContains('google_reviewer', $response->json('account.roles'));
        $this->assertSame([], $response->json('account.permissions'));
    }

    public function test_sandbox_is_role_based_not_email_based(): void
    {
        // Un compte admin portant le MÊME email que le reviewer garde tous ses
        // droits : la protection tient au rôle, à aucun moment à l'email.
        $admin = User::factory()->create(['email' => 'google.review@bogosland.com', 'role' => 'admin']);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/expenses', [])->assertStatus(422); // validé, pas 403
    }

    // ------------------------------------------------------------------
    // 2. Lecture : l'interface employé fonctionne
    // ------------------------------------------------------------------

    public function test_reviewer_can_use_employee_read_endpoints(): void
    {
        $this->actingAsReviewer();

        $this->getJson('/api/me/dashboard')->assertOk();
        $this->getJson('/api/me/advances')->assertOk();
        $this->getJson('/api/me/commissions')->assertOk();
        $this->getJson('/api/prestations')->assertOk();
        $this->getJson('/api/notifications')->assertOk();
    }

    // ------------------------------------------------------------------
    // 3. Aucun accès admin / super admin — refusé par le SERVEUR
    // ------------------------------------------------------------------

    public function test_reviewer_gets_403_on_every_admin_surface(): void
    {
        $this->actingAsReviewer();

        // Lectures gardées par des permissions qu'il n'a pas.
        $this->getJson('/api/dashboard')->assertForbidden();
        $this->getJson('/api/wallet')->assertForbidden();
        $this->getJson('/api/wallets')->assertForbidden();
        $this->getJson('/api/reports/monthly')->assertForbidden();
        $this->getJson('/api/commission-payouts')->assertForbidden();

        // Écritures admin : le sandbox répond avant même les permissions.
        $this->postJson('/api/expenses', ['label' => 'X', 'amount' => 10])->assertForbidden();
        $this->postJson('/api/advances', [])->assertForbidden();
        $this->postJson('/api/work-days', [])->assertForbidden();
        $this->putJson('/api/settings', [])->assertForbidden();
        $this->postJson('/api/wallet/transfers', ['amount' => 10])->assertForbidden();
        $this->postJson('/api/monthly-closures', [])->assertForbidden();
    }

    public function test_reviewer_cannot_modify_or_delete_real_data(): void
    {
        $client = Client::factory()->create(['name' => 'Vraie Cliente']);
        $employee = $this->realEmployee();
        $service = $this->service();

        $this->actingAsReviewer();

        // Modifier : 403 partout.
        $this->putJson("/api/clients/{$client->id}", ['name' => 'Piratée'])->assertForbidden();
        $this->putJson("/api/employees/{$employee->id}", ['name' => 'Piraté'])->assertForbidden();
        $this->putJson("/api/services/{$service->id}", ['price' => 1])->assertForbidden();

        // Supprimer : 403 partout.
        $this->deleteJson("/api/clients/{$client->id}")->assertForbidden();
        $this->deleteJson("/api/employees/{$employee->id}")->assertForbidden();
        $this->deleteJson("/api/services/{$service->id}")->assertForbidden();

        // Rien n'a bougé en base.
        $this->assertSame('Vraie Cliente', $client->fresh()->name);
        $this->assertSame('Vrai Employé', $employee->fresh()->name);
        $this->assertNotNull($service->fresh());
    }

    public function test_reviewer_cannot_touch_roles_permissions_or_own_profile(): void
    {
        $this->actingAsReviewer();

        $this->putJson('/api/profile', ['name' => 'Autre nom'])->assertForbidden();
        $this->postJson('/api/profile/password', [])->assertForbidden();

        $other = User::factory()->create();
        $this->patchJson("/api/users/{$other->id}", ['is_active' => false])->assertForbidden();
        $this->assertTrue((bool) $other->fresh()->is_active);
    }

    // ------------------------------------------------------------------
    // 4. Création de données de test — autorisée, marquée, bornée
    // ------------------------------------------------------------------

    public function test_reviewer_can_compose_a_demo_prestation(): void
    {
        $user = $this->actingAsReviewer();
        $prestation = $this->reviewerPrestation();

        // La prestation est rattachée à SA fiche is_demo : identifiable et
        // nettoyable sans aucune colonne supplémentaire ailleurs.
        $this->assertSame($user->employee->id, $prestation->employee_id);
        $this->assertTrue($prestation->employee->is_demo);

        // Le parcours de composition complet reste ouvert.
        $this->postJson("/api/prestations/{$prestation->id}/items", [
            'label' => 'Ligne de test', 'unit_price' => 50,
        ])->assertStatus(201);

        // storeItem renvoie la prestation entière : l'id de la ligne se lit en base.
        $itemId = $prestation->items()->orderByDesc('id')->value('id');
        $this->patchJson("/api/prestations/{$prestation->id}/items/{$itemId}", ['quantity' => 2])
            ->assertOk();
        $this->deleteJson("/api/prestations/{$prestation->id}/items/{$itemId}")
            ->assertOk();
    }

    public function test_reviewer_prestation_can_never_reach_the_real_caisse(): void
    {
        $this->actingAsReviewer();
        $prestation = $this->reviewerPrestation();

        // Envoyer en caisse ou encaisser ferait entrer une donnée de test
        // dans la comptabilité réelle : bloqué par le serveur.
        $this->postJson("/api/prestations/{$prestation->id}/send-to-caisse")->assertForbidden();
        $this->postJson("/api/prestations/{$prestation->id}/confirm-payment", [])->assertForbidden();
        $this->postJson("/api/prestations/{$prestation->id}/cancel", [])->assertForbidden();
    }

    public function test_reviewer_cannot_delete_even_its_own_prestation(): void
    {
        $this->actingAsReviewer();
        $prestation = $this->reviewerPrestation();

        // Aucune route DELETE /prestations/{id} n'existe (405), et même
        // l'annulation — la « suppression » du parcours employé — est 403.
        $status = $this->deleteJson("/api/prestations/{$prestation->id}")->status();
        $this->assertContains($status, [403, 404, 405]);
        $this->postJson("/api/prestations/{$prestation->id}/cancel", [])->assertForbidden();
        $this->assertNotNull($prestation->fresh());
    }

    // ------------------------------------------------------------------
    // 5. Le Super Admin voit, identifie et nettoie
    // ------------------------------------------------------------------

    public function test_super_admin_sees_the_demo_badge_on_the_employee(): void
    {
        $this->actingAsReviewer();
        $this->reviewerPrestation();

        Sanctum::actingAs($this->superAdmin());

        $response = $this->getJson('/api/employees?include_inactive=1');
        $response->assertOk();

        $reviewerRow = collect($response->json('data'))
            ->firstWhere('name', 'Google Play Reviewer');

        $this->assertNotNull($reviewerRow, 'La fiche de démonstration reste visible pour le Super Admin.');
        $this->assertTrue($reviewerRow['is_demo']);
    }

    public function test_reviewer_cleanup_removes_only_demo_data(): void
    {
        // Une prestation RÉELLE, créée par un vrai employé via la même API.
        $this->openDay();
        $realEmployee = $this->realEmployee();
        Sanctum::actingAs($realEmployee->user);
        $created = $this->postJson('/api/prestations', [
            'client_label' => 'Client réel',
            'items' => [['service_id' => $this->service()->id]],
        ]);
        $created->assertCreated();
        $realPrestation = Prestation::query()->findOrFail($created->json('data.id'));

        $this->actingAsReviewer();
        $demoPrestation = $this->reviewerPrestation();

        // Dry-run : rien ne bouge.
        Artisan::call('reviewer:cleanup', ['--dry-run' => true]);
        $this->assertNotNull($demoPrestation->fresh());

        // Réel : la prestation de démo part (lignes en cascade), le reste vit.
        Artisan::call('reviewer:cleanup');
        $this->assertNull($demoPrestation->fresh());
        $this->assertNotNull($realPrestation->fresh());
        $this->assertSame(0, $demoPrestation->items()->count());

        // Le compte et la fiche restent pour une prochaine validation.
        $this->assertNotNull(User::query()->where('email', 'google.review@bogosland.com')->first());
        $this->assertSame(1, Employee::query()->where('is_demo', true)->count());
    }

    // ------------------------------------------------------------------
    // 6. La fiche de démonstration ne pollue aucun chiffre réel
    // ------------------------------------------------------------------

    public function test_demo_employee_is_excluded_from_payroll_catalog_and_dues(): void
    {
        $this->reviewer();
        $this->realEmployee();

        Sanctum::actingAs($this->superAdmin());

        $payroll = $this->getJson('/api/commission-payouts?period=2026-09');
        $payroll->assertOk();
        $this->assertNull(collect($payroll->json('data'))->firstWhere('employee.name', 'Google Play Reviewer'),
            'La paie ne liste jamais la fiche de démonstration.');

        // La checklist de clôture : une fiche de démonstration qui y figurerait
        // pourrait BLOQUER la clôture d'un mois réel.
        $checklist = $this->getJson('/api/monthly-closures/2026-09/checklist');
        $checklist->assertOk();
        $this->assertStringNotContainsString('Google Play Reviewer', $checklist->getContent(),
            'La checklist de clôture ignore la fiche de démonstration.');

        $dues = $this->getJson('/api/wallet/employee-dues?period=2026-09');
        $dues->assertOk();
        $this->assertNull(collect($dues->json('data.employees'))->firstWhere('name', 'Google Play Reviewer'),
            'Le « reste à payer » du portefeuille ignore la fiche de démonstration.');
    }

    // ------------------------------------------------------------------
    // 7. Les autres rôles ne changent pas d'un iota
    // ------------------------------------------------------------------

    public function test_sandbox_is_transparent_for_every_other_role(): void
    {
        $this->reviewer();

        // Un employé normal compose et envoie en caisse comme avant.
        $this->openDay();
        $employee = $this->realEmployee();
        Sanctum::actingAs($employee->user);
        $created = $this->postJson('/api/prestations', [
            'client_label' => 'Client réel',
            'items' => [['service_id' => $this->service()->id]],
        ]);
        $created->assertCreated();

        // Un super admin garde toutes ses surfaces.
        Sanctum::actingAs($this->superAdmin());
        $this->getJson('/api/dashboard')->assertOk();
        $this->getJson('/api/wallets')->assertOk();
        $this->getJson('/api/settings')->assertOk();
    }
}
