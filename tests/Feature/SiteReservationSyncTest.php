<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppSetting;
use App\Models\Client;
use App\Models\Service;
use App\Models\User;
use App\Notifications\AppointmentNotification;
use App\Services\SiteReservationSync;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Réservations du site bogosland.com (tables du plugin WordPress, simulées en
 * SQLite sur la connexion `wordpress`) → agenda, et statuts dans les deux sens.
 */
class SiteReservationSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->travelTo('2026-09-27 08:00:00');
        AppSetting::updateOrCreate(['key' => 'booking_timezone'], ['value' => 'UTC']);
        Notification::fake();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        foreach ([['Hammam royale', 60, 250], ['Hammam turc', 45, 150], ['Massage sportif 30 min', 30, 250], ['Kératine (à partir de)', 120, 300]] as [$name, $minutes, $price]) {
            Service::factory()->create(['name' => $name, 'duration_minutes' => $minutes, 'price' => $price, 'is_active' => true]);
        }

        config(['database.connections.wordpress' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => 'wp_']]);
        DB::purge('wordpress');
        $schema = Schema::connection('wordpress');
        $schema->create('options', function (Blueprint $table) {
            $table->increments('option_id');
            $table->string('option_name');
            $table->text('option_value');
        });
        $schema->create('bgl_services', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
        });
        $schema->create('bgl_packs', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
        });
        $schema->create('bgl_pack_services', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('pack_id');
            $table->integer('service_id');
            $table->integer('sort_order')->default(0);
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
            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();
        });

        $wp = $this->wp();
        $wp->table('options')->insert(['option_name' => 'timezone_string', 'option_value' => 'Africa/Casablanca']);
        $wp->table('bgl_services')->insert([
            ['id' => 73, 'name' => 'Hammam Turc'],
            ['id' => 74, 'name' => 'Hammam Royale'],
            ['id' => 75, 'name' => 'Massage Sportif 30 min'],
            ['id' => 63, 'name' => 'Kératine'],
            ['id' => 99, 'name' => 'Service retiré'],
        ]);
        $wp->table('bgl_packs')->insert(['id' => 1, 'name' => 'Hammam Turc + Massage Sportif']);
        $wp->table('bgl_pack_services')->insert([
            ['pack_id' => 1, 'service_id' => 73, 'sort_order' => 0],
            ['pack_id' => 1, 'service_id' => 75, 'sort_order' => 1],
        ]);
    }

    private function wp()
    {
        return DB::connection('wordpress');
    }

    private function siteReservation(int $id, array $attributes = []): void
    {
        $this->wp()->table('bgl_appointments')->insert(array_merge([
            'id' => $id,
            'service_id' => 74,
            'pack_id' => null,
            'client_name' => 'Yassine',
            'client_phone' => '06 61 23 45 67',
            'client_email' => 'yassine@example.com',
            'appointment_date' => '2026-09-28',
            'appointment_time' => '18:30:00',
            'duration_min' => 60,
            'price' => 250,
            'status' => 'pending',
            'notes' => null,
            'created_at' => '2026-09-26 09:31:25',
        ], $attributes));
    }

    private function sync(): array
    {
        return app(SiteReservationSync::class)->run();
    }

    public function test_imports_upcoming_site_reservations_as_unassigned_appointments_once(): void
    {
        $this->siteReservation(10, ['notes' => 'Première visite']);
        $this->siteReservation(11, ['service_id' => 0, 'pack_id' => 1, 'status' => 'confirmed', 'price' => 300, 'duration_min' => 90, 'client_phone' => '0700112233', 'client_name' => 'Karim']);
        $this->siteReservation(12, ['status' => 'cancelled']);
        $this->siteReservation(13, ['appointment_date' => '2026-09-20']); // passée
        $this->siteReservation(14, ['service_id' => 63, 'duration_min' => 90, 'client_phone' => '0655443322']);

        $summary = $this->sync();

        $this->assertSame(3, $summary['imported']);
        $single = Appointment::where('external_ref', 'wp:10')->firstOrFail();
        $this->assertSame(Appointment::SOURCE_SITE, $single->source);
        $this->assertSame('pending', $single->status);
        $this->assertSame('pending', $single->external_status);
        $this->assertNull($single->employee_id);
        $this->assertSame('Hammam royale', $single->service->name);
        $this->assertSame('2026-09-28 18:30:00', $single->starts_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-09-28 19:30:00', $single->ends_at->format('Y-m-d H:i:s'));
        $this->assertNull($single->duration_override_minutes);
        $this->assertStringContainsString('Réservation #10 du site', $single->notes);
        $this->assertStringContainsString('Première visite', $single->notes);
        $this->assertSame('+212661234567', $single->client->phone_e164);
        $this->assertNull($single->reservation_items[0]['employee_id']);

        $pack = Appointment::where('external_ref', 'wp:11')->firstOrFail();
        $this->assertSame('confirmed', $pack->status);
        $this->assertSame(['Hammam turc', 'Massage sportif 30 min'], collect($pack->reservation_items)
            ->map(fn ($item) => Service::find($item['service_id'])->name)->all());
        $this->assertEqualsWithDelta(300, array_sum(array_column($pack->reservation_items, 'price_snapshot')), 0.001);
        $this->assertSame(90, $pack->duration_override_minutes);

        // « Kératine » sur le site = « Kératine (à partir de) » dans l'app.
        $this->assertSame('Kératine (à partir de)', Appointment::where('external_ref', 'wp:14')->firstOrFail()->service->name);

        $this->assertDatabaseMissing('appointments', ['external_ref' => 'wp:12']);
        $this->assertDatabaseMissing('appointments', ['external_ref' => 'wp:13']);
        Notification::assertSentTo($this->admin, AppointmentNotification::class);

        // Rejouer ne crée rien.
        $this->assertSame(0, $this->sync()['imported']);
        $this->assertSame(3, Appointment::where('source', Appointment::SOURCE_SITE)->count());
    }

    public function test_reuses_a_client_entered_by_the_team_without_normalized_phone(): void
    {
        $client = Client::factory()->create(['name' => 'Yassine El Amrani', 'phone' => '06.61.23.45.67', 'phone_e164' => null]);
        $this->siteReservation(10);

        $this->sync();

        $this->assertSame($client->id, Appointment::where('external_ref', 'wp:10')->value('client_id'));
        $this->assertSame(1, Client::count());
    }

    public function test_skips_a_reservation_whose_service_has_no_equivalent(): void
    {
        $this->siteReservation(10, ['service_id' => 99]);

        $summary = $this->sync();

        $this->assertSame(0, $summary['imported']);
        $this->assertCount(1, $summary['skipped']);
        $this->assertDatabaseMissing('appointments', ['external_ref' => 'wp:10']);
        // Signalée une fois par jour, pas toutes les 5 minutes.
        $this->assertSame([], $this->sync()['skipped']);
    }

    public function test_syncs_statuses_both_ways(): void
    {
        $this->siteReservation(10);
        $this->siteReservation(11, ['status' => 'confirmed']);
        $this->sync();
        $fromSite = Appointment::where('external_ref', 'wp:10')->firstOrFail();
        $fromAgenda = Appointment::where('external_ref', 'wp:11')->firstOrFail();

        // Site → agenda : confirmée dans l'admin WordPress.
        $this->wp()->table('bgl_appointments')->where('id', 10)->update(['status' => 'confirmed']);
        // Agenda → site : annulée (absent) par l'équipe.
        $fromAgenda->update(['status' => 'no_show']);

        $summary = $this->sync();

        $this->assertSame(1, $summary['to_agenda']);
        $this->assertSame(1, $summary['to_site']);
        $this->assertSame('confirmed', $fromSite->fresh()->status);
        $this->assertDatabaseHas('appointment_status_logs', [
            'appointment_id' => $fromSite->id, 'from_status' => 'pending', 'to_status' => 'confirmed', 'reason' => 'Modifié sur le site bogosland.com',
        ]);
        $this->assertSame('cancelled', $this->wp()->table('bgl_appointments')->find(11)->status);
        $this->assertSame('no_show', $fromAgenda->fresh()->status); // l'agenda garde sa nuance
        $this->assertSame('cancelled', $fromAgenda->fresh()->external_status);

        // Stable : plus rien à faire au passage suivant.
        $again = $this->sync();
        $this->assertSame([0, 0], [$again['to_agenda'], $again['to_site']]);

        // Annulée sur le site → annulée dans l'agenda, avec le motif.
        $this->wp()->table('bgl_appointments')->where('id', 10)->update(['status' => 'cancelled']);
        $this->sync();
        $this->assertSame('cancelled', $fromSite->fresh()->status);
        $this->assertSame('Annulée sur le site bogosland.com', $fromSite->fresh()->cancellation_reason);
    }

    public function test_command_runs_and_reports(): void
    {
        $this->siteReservation(10);

        $this->artisan('site-reservations:sync')
            ->expectsOutputToContain('1 importée(s)')
            ->assertSuccessful();

        // Rien de neuf : silencieuse.
        $this->artisan('site-reservations:sync')->doesntExpectOutputToContain('importée')->assertSuccessful();
    }
}
