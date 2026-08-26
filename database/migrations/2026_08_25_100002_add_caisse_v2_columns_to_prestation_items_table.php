<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse V2 — additive per-line columns. V1 never writes them (NULL on every
 * V1 row) and PrestationItem::lineTotal() ignores them, so V1 totals,
 * commissions and reports are byte-for-byte unchanged.
 *
 * - employee_id: the employee who performed THIS line (V2 assigns per line;
 *   NULL falls back to the prestation header employee — exactly V1 semantics).
 * - discount_amount / discount_reason: line-level remise, applied by V2's own
 *   total computation only.
 * - beneficiary_name: multi-person invoices ("Ahmed vient avec Yassine") —
 *   free-text label per line, mirroring appointments.people's person concept.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->after('service_id')
                ->constrained('employees')->nullOnDelete();
            $table->decimal('discount_amount', 10, 2)->nullable()->after('unit_price');
            $table->string('discount_reason')->nullable()->after('discount_amount');
            $table->string('beneficiary_name')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('employee_id');
            $table->dropColumn(['discount_amount', 'discount_reason', 'beneficiary_name']);
        });
    }
};
