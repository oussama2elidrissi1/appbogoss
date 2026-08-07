<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->boolean('allow_suspension')->default(false)->after('is_active');
            $table->boolean('allow_renewal')->default(true)->after('allow_suspension');
        });

        Schema::table('client_subscriptions', function (Blueprint $table) {
            $table->foreignId('renewed_from_id')->nullable()->after('subscription_plan_id')
                ->constrained('client_subscriptions')->nullOnDelete();
            $table->date('suspension_starts_on')->nullable()->after('ends_on');
            $table->date('suspension_ends_on')->nullable()->after('suspension_starts_on');
            $table->string('suspension_reason')->nullable()->after('suspension_ends_on');
        });
    }

    public function down(): void
    {
        Schema::table('client_subscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('renewed_from_id');
            $table->dropColumn(['suspension_starts_on', 'suspension_ends_on', 'suspension_reason']);
        });

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn(['allow_suspension', 'allow_renewal']);
        });
    }
};
