<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_loyalty_accounts', function (Blueprint $table) {
            $table->string('loyalty_number')->nullable()->unique()->after('client_id');
        });
    }

    public function down(): void
    {
        Schema::table('customer_loyalty_accounts', function (Blueprint $table) {
            $table->dropColumn('loyalty_number');
        });
    }
};
