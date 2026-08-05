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
        Schema::table('employees', function (Blueprint $table) {
            // Precise, per-service allow-list for "Nouvelle prestation" in Mon
            // espace — narrower than service_categories (which only limits by
            // whole category). Null/empty means "no restriction beyond the
            // category filter".
            $table->json('allowed_service_ids')->nullable()->after('service_categories');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('allowed_service_ids');
        });
    }
};
