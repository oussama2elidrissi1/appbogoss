<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Les deux PDF servis par l'API a un client porteur d'un jeton Sanctum.
 *
 * Ces routes sont des miroirs : elles pointent sur les memes controleurs que
 * routes/web.php, avec les memes permissions. Rien n'est recalcule ici, aucune
 * regle financiere n'est dupliquee. Ce fichier verifie donc surtout que le
 * transport (jeton, statut, en-tetes, octets) est correct, et que les gardes
 * n'ont pas ete assouplies au passage.
 */
class MobilePdfApiTest extends TestCase
{
    use RefreshDatabase;

    private function token(string $role): string
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $user = User::factory()->create();
        $user->assignRole($role);

        return $user->createToken('mobile')->plainTextToken;
    }

    private function closedDay(): WorkDay
    {
        return WorkDay::factory()->create([
            'date' => '2026-07-28',
            'status' => 'closed',
            'closed_at' => now(),
            'closing_report' => ['revenue_total' => 0],
        ]);
    }

    // --- Journee de caisse ------------------------------------------------

    public function test_work_day_pdf_is_served_to_a_bearer_token_with_caisse_manage(): void
    {
        $token = $this->token('admin');
        $day = $this->closedDay();

        $response = $this->withToken($token)->get("/api/work-days/{$day->id}/pdf");

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(
            'journee-2026-07-28.pdf',
            (string) $response->headers->get('Content-Disposition'),
        );
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_work_day_pdf_requires_a_token(): void
    {
        $day = $this->closedDay();

        $this->get("/api/work-days/{$day->id}/pdf")->assertUnauthorized();
    }

    public function test_work_day_pdf_is_refused_without_caisse_manage(): void
    {
        $token = $this->token('employee');
        $day = $this->closedDay();

        $this->withToken($token)->get("/api/work-days/{$day->id}/pdf")->assertForbidden();
    }

    public function test_work_day_pdf_returns_404_for_an_unknown_day(): void
    {
        $token = $this->token('admin');

        $this->withToken($token)->get('/api/work-days/999999/pdf')->assertNotFound();
    }

    public function test_work_day_pdf_still_refuses_a_day_that_is_not_closed(): void
    {
        $token = $this->token('admin');
        $day = WorkDay::factory()->create(['status' => 'open']);

        $this->withToken($token)
            ->getJson("/api/work-days/{$day->id}/pdf")
            ->assertStatus(422);
    }

    // --- Rapport mensuel --------------------------------------------------

    public function test_monthly_pdf_is_served_to_a_bearer_token_with_reports_view_all(): void
    {
        $token = $this->token('admin');

        $response = $this->withToken($token)->get('/api/reports/monthly/pdf?month=2026-07');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(
            'rapport-mensuel-2026-07.pdf',
            (string) $response->headers->get('Content-Disposition'),
        );
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_monthly_pdf_requires_a_token(): void
    {
        $this->get('/api/reports/monthly/pdf')->assertUnauthorized();
    }

    public function test_monthly_pdf_is_refused_without_reports_view_all(): void
    {
        $token = $this->token('employee');

        $this->withToken($token)->get('/api/reports/monthly/pdf')->assertForbidden();
    }

    public function test_monthly_pdf_rejects_a_malformed_month(): void
    {
        $token = $this->token('admin');

        $this->withToken($token)
            ->getJson('/api/reports/monthly/pdf?month=juillet')
            ->assertStatus(422);
    }

    // --- Parite avec le web -----------------------------------------------

    /**
     * Garde-fou contre la derive : si quelqu'un change la permission cote web
     * sans toucher au miroir API (ou l'inverse), ce test tombe. C'est la seule
     * chose qui garantit que le mobile n'ouvre pas une porte plus large.
     */
    public function test_api_mirrors_carry_the_same_permission_as_their_web_routes(): void
    {
        $pairs = [
            ['api/work-days/{workDay}/pdf', 'work-days/{workDay}/pdf', 'permission:caisse.manage'],
            ['api/reports/monthly/pdf', 'reports/monthly/pdf', 'permission:reports.view_all'],
        ];

        // chr(92) = antislash, ecrit ainsi pour rester lisible dans une chaine.
        $normalize = fn ($action) => ltrim((string) $action, chr(92));

        foreach ($pairs as [$apiUri, $webUri, $permission]) {
            $api = collect(Route::getRoutes())->firstWhere('uri', $apiUri);
            $web = collect(Route::getRoutes())->firstWhere('uri', $webUri);

            $this->assertNotNull($api, "Route API absente : {$apiUri}");
            $this->assertNotNull($web, "Route web absente : {$webUri}");

            $this->assertSame(
                $normalize($web->getAction('controller')),
                $normalize($api->getAction('controller')),
                "Le miroir {$apiUri} n'appelle pas le meme controleur que {$webUri}.",
            );
            $this->assertContains($permission, $api->gatherMiddleware(), "{$apiUri} a perdu {$permission}.");
            $this->assertContains($permission, $web->gatherMiddleware(), "{$webUri} a perdu {$permission}.");
            $this->assertContains('auth:sanctum', $api->gatherMiddleware(), "{$apiUri} n'est pas sous auth:sanctum.");
        }
    }
}
