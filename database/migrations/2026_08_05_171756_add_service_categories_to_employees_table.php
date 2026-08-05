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
            // Which service catalog categories this employee performs — used
            // to narrow "Nouvelle prestation" in Mon espace to their own
            // trade instead of every category. Null/empty means "no
            // restriction, show everything" (the pre-existing behaviour).
            $table->json('service_categories')->nullable()->after('specialties');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('service_categories');
        });
    }
};
