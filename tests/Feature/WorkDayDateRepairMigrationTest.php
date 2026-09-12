<?php

namespace Tests\Feature;

use App\Models\MonthlyClosure;
use App\Models\User;
use App\Models\WorkDay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * La migration de reparation touche a des dates financieres deja enregistrees.
 * Chacun de ses garde-fous est verifie ici : elle corrige exactement les
 * journees mal estampillees, et rien d'autre.
 */
class WorkDayDateRepairMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function runRepair(): void
    {
        $migration = require database_path('migrations/2026_09_12_000000_fix_work_day_dates_stamped_in_utc.php');
        $migration->up();
    }

    public function test_it_moves_a_day_opened_after_midnight_to_the_day_it_belongs_to(): void
    {
        // 23h30 UTC le 10 = 00h30 a Casablanca le 11.
        $day = WorkDay::factory()->create([
            'date' => '2026-09-10',
            'created_at' => '2026-09-10 23:30:00',
            'updated_at' => '2026-09-10 23:30:00',
        ]);

        $this->runRepair();

        $this->assertSame('2026-09-11', $day->fresh()->date->toDateString());
    }

    public function test_it_leaves_a_day_opened_during_business_hours_alone(): void
    {
        $day = WorkDay::factory()->create([
            'date' => '2026-09-10',
            'created_at' => '2026-09-10 14:00:00',
            'updated_at' => '2026-09-10 14:00:00',
        ]);

        $this->runRepair();

        $this->assertSame('2026-09-10', $day->fresh()->date->toDateString());
    }

    /**
     * Une date qui ne correspond pas au jour UTC de creation a ete posee ou
     * corrigee a la main. La migration n'a rien a en dire.
     */
    public function test_it_leaves_a_hand_set_date_alone(): void
    {
        $day = WorkDay::factory()->create([
            'date' => '2026-09-02',
            'created_at' => '2026-09-10 23:30:00',
            'updated_at' => '2026-09-10 23:30:00',
        ]);

        $this->runRepair();

        $this->assertSame('2026-09-02', $day->fresh()->date->toDateString());
    }

    /** Un mois cloture ne se reecrit pas, meme pour corriger une date. */
    public function test_it_refuses_to_move_a_day_across_a_closed_month(): void
    {
        $day = WorkDay::factory()->create([
            'date' => '2026-09-30',
            'created_at' => '2026-09-30 23:30:00',
            'updated_at' => '2026-09-30 23:30:00',
        ]);

        MonthlyClosure::create([
            'period' => '2026-09',
            'closed_by_user_id' => User::factory()->create()->id,
            'closed_at' => '2026-10-05 10:00:00',
            'closing_report' => [],
        ]);

        $this->runRepair();

        $this->assertSame('2026-09-30', $day->fresh()->date->toDateString());
    }
}
