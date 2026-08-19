<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The real, persisted counterpart of Commission (employee ledger) — one
     * row per paid PrestationItem belonging to a partner-owned client.
     * Deliberately NOT linked to Appointment: there is no booking→payment
     * conversion flow in this app (a client can be booked once and walk in
     * many times, or walk in without ever booking), so accrual is driven by
     * client ownership at the moment of actual payment (PrestationService::
     * confirmPayment), exactly mirroring how Commission rows are created —
     * see PartnerCommissionService. "Commission estimée" (pre-payment) is
     * therefore never stored here; it's computed live from the partner's
     * pending/confirmed Appointments.
     */
    public function up(): void
    {
        Schema::create('partner_commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained();
            $table->foreignId('client_id')->constrained();
            $table->foreignId('prestation_id')->constrained();
            $table->foreignId('prestation_item_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('rule_id')->nullable()->constrained('partner_service_commissions')->nullOnDelete();
            $table->string('type')->nullable();
            $table->decimal('rate_or_amount', 8, 2)->nullable();
            $table->decimal('base_amount', 10, 2)->default(0);
            $table->decimal('amount', 10, 2)->default(0);
            $table->string('status', 20)->default('validated');
            $table->foreignId('partner_commission_payout_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['partner_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_commissions');
    }
};
