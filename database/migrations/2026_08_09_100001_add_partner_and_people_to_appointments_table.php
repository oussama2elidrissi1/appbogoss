<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->foreignId('partner_id')->nullable()->after('client_ids')->constrained('partners')->nullOnDelete();
            // Participants of the reservation: [{"name": "..."}]. Index 0 is the
            // booking contact (the only person whose coordinates are captured,
            // via the client_id FK). reservation_items entries reference a
            // participant through their `person_index` key.
            $table->json('people')->nullable()->after('reservation_items');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('partner_id');
            $table->dropColumn('people');
        });
    }
};
