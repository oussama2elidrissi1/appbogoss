<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin view of where every client stands on a loyalty program (7/10, 3/10…). */
class LoyaltyProgramProgressApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');
        Sanctum::actingAs($user);
    }

    public function test_progress_lists_clients_sorted_with_percent_and_rewards(): void
    {
        $this->actingAsAdmin();

        $program = LoyaltyProgram::create([
            'name' => '10 coupes = 1 hammam',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['threshold' => 10],
        ]);

        $ahead = Client::factory()->create(['name' => 'Client Avancé']);
        $behind = Client::factory()->create(['name' => 'Client Débutant']);

        LoyaltyProgramProgress::create([
            'client_id' => $ahead->id,
            'loyalty_program_id' => $program->id,
            'counter' => 7,
            'last_activity_at' => now(),
        ]);
        LoyaltyProgramProgress::create([
            'client_id' => $behind->id,
            'loyalty_program_id' => $program->id,
            'counter' => 3,
            'last_activity_at' => now()->subDay(),
        ]);
        LoyaltyReward::create([
            'client_id' => $ahead->id,
            'loyalty_program_id' => $program->id,
            'type' => 'free_service',
            'status' => LoyaltyReward::STATUS_USED,
            'generated_at' => now(),
        ]);
        // Cancelled rewards must not count as earned.
        LoyaltyReward::create([
            'client_id' => $ahead->id,
            'loyalty_program_id' => $program->id,
            'type' => 'free_service',
            'status' => LoyaltyReward::STATUS_CANCELLED,
            'generated_at' => now(),
        ]);

        $response = $this->getJson("/api/loyalty-programs/{$program->id}/progress")
            ->assertOk()
            ->json();

        $this->assertSame(2, $response['meta']['participants']);
        $this->assertEquals(10, $response['meta']['threshold']);
        $this->assertSame(1, $response['meta']['rewards_total']);

        // Most advanced client first.
        $this->assertSame('Client Avancé', $response['data'][0]['client_name']);
        $this->assertEquals(7, $response['data'][0]['current']);
        $this->assertSame(70, $response['data'][0]['percent']);
        $this->assertEquals(3, $response['data'][0]['remaining']);
        $this->assertSame(1, $response['data'][0]['rewards_earned']);

        $this->assertSame('Client Débutant', $response['data'][1]['client_name']);
        $this->assertSame(30, $response['data'][1]['percent']);
    }

    public function test_points_programs_read_the_points_balance_column(): void
    {
        $this->actingAsAdmin();

        $program = LoyaltyProgram::create([
            'name' => 'Points',
            'type' => LoyaltyProgram::TYPE_POINTS,
            'is_active' => true,
            'config' => ['threshold' => 100],
        ]);
        $client = Client::factory()->create();
        LoyaltyProgramProgress::create([
            'client_id' => $client->id,
            'loyalty_program_id' => $program->id,
            'counter' => 0,
            'points_balance' => 45,
        ]);

        $this->getJson("/api/loyalty-programs/{$program->id}/progress")
            ->assertOk()
            ->assertJsonPath('data.0.percent', 45);
    }

    public function test_progress_requires_the_loyalty_manage_permission(): void
    {
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $program = LoyaltyProgram::create([
            'name' => 'P',
            'type' => LoyaltyProgram::TYPE_SERVICE_COUNT,
            'is_active' => true,
            'config' => ['threshold' => 5],
        ]);

        $this->getJson("/api/loyalty-programs/{$program->id}/progress")->assertForbidden();
    }
}
