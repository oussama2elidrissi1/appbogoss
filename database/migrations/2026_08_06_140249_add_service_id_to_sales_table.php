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
            // Legacy quick-checkout sales never linked back to the service
            // catalog — commission had to be typed by hand or left blank.
            // Capturing it lets the caisse auto-calculate commission the
            // same way the Prestation workflow already does.
            $table->foreignId('service_id')->nullable()->after('category')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_id');
        });
    }
};
