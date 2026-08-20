<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Employee;
use App\Models\LoyaltyLedgerEntry;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\Sale;
use App\Models\Service;
use App\Models\WorkDay;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DiagnoseLoyaltyAccrualCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function makeSale(array $overrides = []): Sale
    {
        return Sale::create(array_merge([
            'work_day_id' => WorkDay::factory()->create()->id,
            'employee_id' => Employee::factory()->create()->id,
            'category' => 'coiffure',
            'total' => 100,
            'payment_method' => 'especes',
        ], $overrides));
    }

    public function test_reprocess_catches_up_missed_sales_without_double_counting_and_skips_walkins(): void
    {
        $service = Service::factory()->create(['category' => 'coiffure']);
        $program = LoyaltyProgram::create([
            'name' => '10 coupes',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['threshold' => 10, 'category' => 'coiffure'],
        ]);

        $client = Client::factory()->create();
        // Missed: client fiché, matching category, no ledger entry.
        $missed = $this->makeSale(['client_id' => $client->id, 'service_id' => $service->id]);
        // Walk-in: no client — can never accrue.
        $this->makeSale(['client_id' => null]);
        // Wrong category: must not accrue for this program.
        $this->makeSale(['client_id' => $client->id, 'category' => 'massage']);

        $this->artisan('loyalty:diagnose', ['--days' => 7, '--reprocess' => true])
            ->expectsConfirmation('Repasser 1 vente(s) dans le moteur de fidélité ?', 'yes')
            ->assertSuccessful();

        $progress = LoyaltyProgramProgress::where('client_id', $client->id)
            ->where('loyalty_program_id', $program->id)
            ->first();
        $this->assertNotNull($progress);
        $this->assertSame(1, $progress->counter);
        $this->assertSame(1, LoyaltyLedgerEntry::where('sourceable_id', $missed->id)->count());

        // Running it again finds nothing to catch up and never double-counts.
        $this->artisan('loyalty:diagnose', ['--days' => 7, '--reprocess' => true])->assertSuccessful();
        $this->assertSame(1, $progress->fresh()->counter);
        $this->assertSame(1, LoyaltyLedgerEntry::where('sourceable_id', $missed->id)->count());
    }

    public function test_contradictory_config_is_flagged_loudly(): void
    {
        $coupe = Service::factory()->create(['name' => 'Coupe cheveux + barbe', 'category' => 'coiffure']);
        LoyaltyProgram::create([
            'name' => '10 coupes = hammam gratuit',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            // Legacy contradictory row: category hammam + a coiffure service.
            'config' => ['threshold' => 10, 'category' => 'hammam', 'service_id' => $coupe->id],
        ]);

        $this->artisan('loyalty:diagnose', ['--days' => 7])
            ->expectsOutputToContain('CONFIGURATION CONTRADICTOIRE')
            ->assertSuccessful();
    }

    public function test_without_reprocess_nothing_is_modified(): void
    {
        $service = Service::factory()->create(['category' => 'coiffure']);
        LoyaltyProgram::create([
            'name' => 'P',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['threshold' => 5, 'category' => 'coiffure'],
        ]);
        $this->makeSale(['client_id' => Client::factory()->create()->id, 'service_id' => $service->id]);

        $this->artisan('loyalty:diagnose', ['--days' => 7])->assertSuccessful();

        $this->assertSame(0, LoyaltyLedgerEntry::count());
        $this->assertSame(0, LoyaltyProgramProgress::count());
    }
}
