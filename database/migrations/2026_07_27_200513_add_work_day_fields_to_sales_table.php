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
        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('work_day_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('category')->nullable()->after('employee_id');
            $table->decimal('commission_amount', 10, 2)->nullable()->after('total');
            $table->string('client_label')->nullable()->after('client_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('work_day_id');
            $table->dropColumn(['category', 'commission_amount', 'client_label']);
        });
    }
};
