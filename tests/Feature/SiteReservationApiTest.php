<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Réservations du site vitrine (tables du plugin WordPress
 * bogosland-reservation), lues en lecture seule via la connexion `wordpress`.
 * En test, cette connexion pointe vers une base SQLite en mémoire qui
 * reproduit les tables du plugin (même préfixe wp_).
 */
class SiteReservationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        config(['database.connections.wordpress' => [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => 'wp_',
        ]]);
        DB::purge('wordpress');

        $schema = Schema::connection('wordpress');
        $schema->create('bgl_services', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('category');
        });
        $schema->create('bgl_packs', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
        });
        $schema->create('bgl_appointments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('service_id')->default(0);
            $table->integer('pack_id')->nullable();
            $table->string('client_name');
            $table->string('client_phone');
            $table->string('client_email')->nullable();
            $table->date('appointment_date');
            $table->time('appointment_time');
            $table->integer('duration_min')->default(30);
            $table->decimal('price', 10, 2)->default(0);
            $table->string('status')->default('pending');
            $table->text('notes')->nullable();
            $table->dateTime('created_at');
            $table->dateTime('updated_at')->nullable();
        });
        $schema->create('options', function (Blueprint $table) {
            $table->increments('option_id');
            $table->string('option_name');
            $table->text('option_value');
        });

        $db = DB::connection('wordpress');
        $db->table('options')->insert(['option_name' => 'timezone_string', 'option_value' => 'Africa/Casablanca']);
        $db->table('bgl_services')->insert(['id' => 1, 'name' => 'Hammam Royale', 'category' => 'hammam']);
        $db->table('bgl_packs')->insert(['id' => 7, 'name' => 'Pack Détente']);
        $db->table('bgl_appointments')->insert([
            $this->appointment(1, ['client_name' => 'Karim', 'service_id' => 1, 'status' => 'pending', 'created_at' => '2026-09-20 10:00:00']),
            $this->appointment(2, ['client_name' => 'Yassine', 'service_id' => 0, 'pack_id' => 7, 'status' => 'confirmed', 'price' => 600, 'created_at' => '2026-09-25 18:30:00']),
            $this->appointment(3, ['client_name' => 'Omar', 'client_phone' => '0612345678', 'service_id' => 1, 'status' => 'completed', 'created_at' => '2026-09-22 09:15:00']),
        ]);
    }

    private function appointment(int $id, array $attributes): array
    {
        return array_merge([
            'id' => $id,
            'service_id' => 0,
            'pack_id' => null,
            'client_name' => 'Client',
            'client_phone' => '0600000000',
            'client_email' => null,
            'appointment_date' => '2026-10-01',
            'appointment_time' => '14:30:00',
            'duration_min' => 60,
            'price' => 250,
            'status' => 'pending',
            'notes' => null,
            'created_at' => '2026-09-01 00:00:00',
            'updated_at' => null,
        ], $attributes);
    }

    private function actingAsAgendaManager(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
    }

    public function test_lists_site_reservations_newest_first_with_service_or_pack_and_status_counts(): void
    {
        $this->actingAsAgendaManager();

        $response = $this->getJson('/api/site-reservations')->assertOk();

        $this->assertSame([2, 3, 1], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('data.0.service', 'Pack Détente')
            ->assertJsonPath('data.0.is_pack', true)
            ->assertJsonPath('data.0.time', '14:30')
            ->assertJsonPath('data.2.service', 'Hammam Royale')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('counts', ['all' => 3, 'pending' => 1, 'confirmed' => 1, 'completed' => 1, 'cancelled' => 0]);
    }

    public function test_filters_by_status_and_searches_name_or_phone(): void
    {
        $this->actingAsAgendaManager();

        $this->getJson('/api/site-reservations?status=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.client_name', 'Karim')
            // Les compteurs restent globaux : ils alimentent les onglets.
            ->assertJsonPath('counts.all', 3);

        $this->getJson('/api/site-reservations?search=061234')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.client_name', 'Omar');

        $this->getJson('/api/site-reservations?status=unknown')->assertUnprocessable();
    }

    public function test_requires_the_agenda_permission(): void
    {
        $employee = User::factory()->create(['role' => 'employee']);
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $this->getJson('/api/site-reservations')->assertForbidden();
    }

    public function test_confirms_a_pending_reservation_like_the_plugin_admin_and_logs_it(): void
    {
        $this->actingAsAgendaManager();
        $this->travelTo('2026-09-27 10:00:00'); // UTC → 11:00 à Casablanca

        $this->postJson('/api/site-reservations/1/status', ['status' => 'confirmed'])
            ->assertOk()
            ->assertJsonPath('data.id', 1)
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.service', 'Hammam Royale');

        $row = DB::connection('wordpress')->table('bgl_appointments')->find(1);
        $this->assertSame('confirmed', $row->status);
        $this->assertSame('2026-09-27 11:00:00', $row->updated_at);
        $this->assertDatabaseHas('activity_logs', ['action' => 'site_reservation.confirmed']);

        $this->postJson('/api/site-reservations/1/status', ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_refuses_to_skip_a_step_or_touch_an_unknown_reservation(): void
    {
        $this->actingAsAgendaManager();

        // #1 est en attente : on ne peut pas la terminer sans la confirmer.
        $this->postJson('/api/site-reservations/1/status', ['status' => 'completed'])->assertStatus(409);
        // #3 est déjà terminée.
        $this->postJson('/api/site-reservations/3/status', ['status' => 'confirmed'])->assertStatus(409);
        // Pas d'annulation ni de retour en arrière depuis l'application.
        $this->postJson('/api/site-reservations/2/status', ['status' => 'cancelled'])->assertUnprocessable();
        $this->postJson('/api/site-reservations/999/status', ['status' => 'confirmed'])->assertNotFound();

        $this->assertSame('pending', DB::connection('wordpress')->table('bgl_appointments')->find(1)->status);
        $this->assertSame('completed', DB::connection('wordpress')->table('bgl_appointments')->find(3)->status);
    }

    public function test_status_changes_require_the_agenda_permission(): void
    {
        $employee = User::factory()->create(['role' => 'employee']);
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $this->postJson('/api/site-reservations/1/status', ['status' => 'confirmed'])->assertForbidden();
        $this->assertSame('pending', DB::connection('wordpress')->table('bgl_appointments')->find(1)->status);
    }

    public function test_answers_503_when_the_wordpress_database_is_not_configured(): void
    {
        $this->actingAsAgendaManager();
        config(['database.connections.wordpress.database' => null]);

        $this->getJson('/api/site-reservations')
            ->assertStatus(503)
            ->assertJsonStructure(['message']);
    }
}
