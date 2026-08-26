<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse V2 — additive columns on prestations. V1 never writes any of them,
 * so every V1 row keeps NULL and every V1 code path is untouched.
 *
 * - channel: 'caisse_v2' marks invoices created by the new POS; NULL = V1.
 * - appointment_id: a reservation opened at the caisse (no such link existed
 *   before — see the partner_commissions migration docblock explaining why —
 *   Caisse V2 introduces it deliberately and keeps it nullable).
 * - held_at: "mise en attente" marker for the open-invoices board.
 * - discount_reason / discount_by_user_id: audit trail for the invoice-level
 *   discount (the amount itself reuses the existing discount_amount column).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestations', function (Blueprint $table) {
            $table->string('channel', 20)->nullable()->index()->after('status');
            $table->foreignId('appointment_id')->nullable()->after('client_id')
                ->constrained('appointments')->nullOnDelete();
            $table->timestamp('held_at')->nullable()->after('notes');
            $table->string('discount_reason')->nullable()->after('discount_amount');
            $table->foreignId('discount_by_user_id')->nullable()->after('discount_reason')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('prestations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('appointment_id');
            $table->dropConstrainedForeignId('discount_by_user_id');
            $table->dropColumn(['channel', 'held_at', 'discount_reason']);
        });
    }
};
