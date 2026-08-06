<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plan_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_plan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->string('quota_period')->nullable();
            $table->unsignedInteger('quota_per_period')->nullable();
            $table->unsignedInteger('quota_total')->nullable();
            $table->boolean('allow_rollover')->default(false);
            $table->string('commission_basis')->default('public_price');
            $table->decimal('commission_value', 10, 2)->nullable();
            $table->timestamps();

            $table->unique(['subscription_plan_id', 'service_id'], 'subscription_plan_services_plan_service_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plan_services');
    }
};
