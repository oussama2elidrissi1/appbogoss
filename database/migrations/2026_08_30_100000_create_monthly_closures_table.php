<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Monthly closure — the accounting lock on a finished month.
 *
 * Deliberately ADDITIVE and minimal: not one existing column changes, and no
 * historical row is rewritten. A month is "open" precisely when it has no row
 * here, which means months keep being *derived from dates* exactly as they
 * already were (`now()->format('Y-m')`, `?period=YYYY-MM`). There is no
 * "month opening" record and there must never be one — the new month starts on
 * its own at midnight with zeroed counters simply because no row carries its
 * dates yet. Materialising an "open month" would be the second, parallel
 * financial truth this feature was explicitly asked not to create.
 *
 * `period` is UNIQUE. That is the last-resort concurrency guard: two
 * simultaneous closures of the same month cannot both insert. The service
 * still checks first and returns a proper business error — the constraint only
 * catches the race between check and write.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monthly_closures', function (Blueprint $table) {
            $table->id();
            $table->string('period', 7)->unique(); // 'YYYY-MM'
            $table->foreignId('closed_by_user_id')->constrained('users');
            $table->timestamp('closed_at');
            // Frozen snapshot: employees, commissions, advances, payouts, cash
            // days and totals as they stood at closing time. Kept so the
            // history stays readable even after later data changes.
            $table->json('closing_report');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_closures');
    }
};
