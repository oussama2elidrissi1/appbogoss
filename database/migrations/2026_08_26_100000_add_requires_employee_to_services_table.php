<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse V2 §13 — business flag: does this service need a responsible
 * employee on the invoice line? Every existing catalog service is a human
 * prestation, hence default TRUE for all current rows. Future non-human
 * lines (produit, frais…) can opt out. Free-text lines (no service_id)
 * never require an employee regardless of this flag.
 *
 * Additive and backward compatible: V1 never reads it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->boolean('requires_employee')->default(true)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('requires_employee');
        });
    }
};
