<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('work_days', function (Blueprint $table) {
            $table->decimal('closing_balance_actual', 10, 2)->nullable()->after('closing_report');
            $table->decimal('closing_variance', 10, 2)->nullable()->after('closing_balance_actual');
            $table->text('closing_comment')->nullable()->after('closing_variance');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('work_days', function (Blueprint $table) {
            $table->dropColumn(['closing_balance_actual', 'closing_variance', 'closing_comment']);
        });
    }
};
