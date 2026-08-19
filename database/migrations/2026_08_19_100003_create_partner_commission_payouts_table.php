<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per admin "marquer comme payé" action on partner commissions —
     * the counterpart of commission_payouts for employees, but partners are
     * paid ad-hoc (a selected set of validated commissions, any period) not
     * strictly monthly, hence the explicit payment_method/reference (§21).
     */
    public function up(): void
    {
        Schema::create('partner_commission_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained();
            $table->decimal('amount', 10, 2)->default(0);
            $table->string('payment_method', 50)->nullable();
            $table->string('reference')->nullable();
            $table->foreignId('paid_by_user_id')->constrained('users');
            $table->timestamp('paid_at');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_commission_payouts');
    }
};
