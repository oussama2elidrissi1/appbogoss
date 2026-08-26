<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Versements d'abonnement (Caisse V2 §16). Event-sourced like every other
 * money trail in this app: each installment collected on a partially-paid
 * subscription is one row + one Sale on the open work day, so the money
 * lands in the day's revenue/cash_expected through the existing report
 * pipeline with zero changes to WorkDayService.
 *
 * Paying an installment and consuming a visit are two DIFFERENT events —
 * a payment row never touches client_subscription_usages and vice versa.
 * sale_id nullOnDelete + "sale not trashed" filtering on the read side means
 * a voided installment ticket stops counting toward the balance, mirroring
 * how the purchase Sale already behaves for refundPurchase().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_subscription_id')
                ->constrained('client_subscriptions')->cascadeOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('payment_method', 20)->default('especes');
            $table->foreignId('collected_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->index(['client_subscription_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
    }
};
