<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->foreignId('created_by_user_id')->nullable()->after('people')->constrained('users')->nullOnDelete();
            $table->foreignId('confirmed_by_user_id')->nullable()->after('created_by_user_id')->constrained('users')->nullOnDelete();
            $table->foreignId('cancelled_by_user_id')->nullable()->after('confirmed_by_user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by_user_id');
            $table->string('cancellation_reason')->nullable()->after('cancelled_at');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by_user_id');
            $table->dropConstrainedForeignId('confirmed_by_user_id');
            $table->dropConstrainedForeignId('cancelled_by_user_id');
            $table->dropColumn(['cancelled_at', 'cancellation_reason']);
        });
    }
};
