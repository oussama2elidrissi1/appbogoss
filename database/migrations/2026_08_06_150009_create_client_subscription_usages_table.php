<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_subscription_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_subscription_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_service_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('reserved');
            $table->foreignId('reserved_prestation_id')->nullable()->constrained('prestations')->nullOnDelete();
            $table->foreignId('prestation_item_id')->nullable()->constrained('prestation_items')->nullOnDelete();
            $table->date('used_on');
            $table->string('period_key')->nullable();
            $table->unsignedInteger('sequence_in_period')->nullable();
            $table->unsignedInteger('sequence_total')->nullable();
            $table->boolean('exception_override')->default(false);
            $table->string('override_reason')->nullable();
            $table->foreignId('override_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // NULL-inert: only enforced when a periodic/lifetime quota is actually
            // configured for this plan service — a double-click computing the same
            // sequence number for the same period collides here even under SQLite,
            // where lockForUpdate() alone is a no-op.
            $table->unique(
                ['client_subscription_id', 'subscription_plan_service_id', 'period_key', 'sequence_in_period'],
                'subscription_usage_period_unique'
            );
            $table->unique(
                ['client_subscription_id', 'subscription_plan_service_id', 'sequence_total'],
                'subscription_usage_total_unique'
            );
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_subscription_usages');
    }
};
