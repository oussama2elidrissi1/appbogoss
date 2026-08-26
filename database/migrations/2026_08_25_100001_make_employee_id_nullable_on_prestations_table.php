<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse V2 assigns the employee per LINE (prestation_items.employee_id), so
 * the invoice header no longer requires a single owning employee — a walk-in
 * invoice served by several employees has no meaningful header owner until
 * checkout stamps the first line's employee back onto it.
 *
 * Backward compatible: V1 always writes employee_id (PrestationService::create
 * requires the actor's employee), so no V1 row ever becomes NULL. Same
 * precedent as 2026_08_03_100000_make_employee_id_nullable_on_appointments.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestations', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Intentionally left irreversible: reverting to NOT NULL would fail
        // as soon as one V2 invoice with a NULL header employee exists.
    }
};
