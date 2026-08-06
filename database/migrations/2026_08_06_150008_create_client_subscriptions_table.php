<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_id')->constrained();
            $table->json('plan_snapshot')->nullable();
            $table->string('status')->default('active');
            $table->timestamp('purchased_at')->nullable();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('purchase_prestation_id')->nullable()->constrained('prestations')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('ends_on');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_subscriptions');
    }
};
