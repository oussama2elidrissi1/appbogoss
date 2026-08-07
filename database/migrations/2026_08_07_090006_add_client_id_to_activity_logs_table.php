<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer-portal actions (registration, OTP login) have no `User` actor —
 * ActivityLogger::log() previously only recorded Auth::id() (the staff
 * guard), which is null for these. A separate nullable client_id lets the
 * audit trail attribute an event to a customer without pretending they're
 * a staff user.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->foreignId('client_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('client_id');
        });
    }
};
