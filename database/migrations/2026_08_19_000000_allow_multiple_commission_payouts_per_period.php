<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An employee can leave mid-month, get paid, then come back and earn more
     * commission in the same month — so one period may now hold several
     * payouts, each covering the commission earned since the previous one.
     * The "never pay twice" guard moved from this unique index to the
     * service, which refuses a payout when nothing new is owed.
     */
    public function up(): void
    {
        Schema::table('commission_payouts', function (Blueprint $table) {
            // New index first: the employee_id foreign key needs one, and
            // MySQL refuses to drop the unique index while it's the only one.
            $table->index(['employee_id', 'period']);
            $table->dropUnique(['employee_id', 'period']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('commission_payouts', function (Blueprint $table) {
            $table->unique(['employee_id', 'period']);
            $table->dropIndex(['employee_id', 'period']);
        });
    }
};
