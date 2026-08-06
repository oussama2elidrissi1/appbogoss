<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->foreignId('loyalty_reward_id')->nullable()->after('commission_rule_id')->constrained('loyalty_rewards')->nullOnDelete();
            $table->foreignId('client_subscription_id')->nullable()->after('loyalty_reward_id')->constrained('client_subscriptions')->nullOnDelete();
            $table->boolean('is_free')->default(false)->after('client_subscription_id');
            $table->decimal('public_price', 10, 2)->nullable()->after('is_free');
            $table->string('commission_basis')->nullable()->after('public_price');
            $table->decimal('commission_base_override', 10, 2)->nullable()->after('commission_basis');
        });
    }

    public function down(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('loyalty_reward_id');
            $table->dropConstrainedForeignId('client_subscription_id');
            $table->dropColumn(['is_free', 'public_price', 'commission_basis', 'commission_base_override']);
        });
    }
};
