<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every client BOGOSLAND already has is unowned (partner_id null) — the
     * global pool stays exactly as visible to staff as it is today. Only
     * clients a partner brings in going forward get a partner_id, and that
     * ownership never transfers between partners once set.
     */
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            // MySQL indexes a FK column automatically for the constraint itself.
            $table->foreignId('partner_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->after('partner_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropConstrainedForeignId('partner_id');
            $table->dropConstrainedForeignId('created_by_user_id');
        });
    }
};
