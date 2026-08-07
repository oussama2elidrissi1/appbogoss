<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_programs', function (Blueprint $table) {
            $table->unsignedInteger('max_rewards')->nullable()->after('config');
            $table->boolean('stackable')->default(true)->after('max_rewards');
            $table->integer('priority')->default(0)->after('stackable');
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_programs', function (Blueprint $table) {
            $table->dropColumn(['max_rewards', 'stackable', 'priority']);
        });
    }
};
