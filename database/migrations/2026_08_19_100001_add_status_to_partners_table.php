<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds the pending/active/suspended/disabled lifecycle on top of the
     * existing `is_active` boolean, which stays as the authoritative flag
     * every existing query/resource/controller already reads — the Partner
     * model keeps both in sync on save, so nothing that reads `is_active`
     * needs to change, while the UI gets the richer 4-state status.
     */
    public function up(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->string('status', 20)->default('active')->after('is_active');
        });

        DB::table('partners')->where('is_active', false)->update(['status' => 'disabled']);
        DB::table('partners')->where('is_active', true)->update(['status' => 'active']);
    }

    public function down(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
