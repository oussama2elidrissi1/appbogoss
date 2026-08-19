<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dateTime('proposed_starts_at')->nullable()->after('cancellation_reason');
            $table->dateTime('proposed_ends_at')->nullable()->after('proposed_starts_at');
            $table->string('proposal_note')->nullable()->after('proposed_ends_at');
            // 'proposed' | 'accepted' | 'declined' — validated at the request layer,
            // same convention as the `status` column itself.
            $table->string('proposal_status')->nullable()->after('proposal_note');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['proposed_starts_at', 'proposed_ends_at', 'proposal_note', 'proposal_status']);
        });
    }
};
