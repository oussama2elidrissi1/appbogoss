<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse V2 — product lines (vente vitrine / réfrigérateur) on invoices.
 * V1 sells products through its own quick-sale path (TransactionController)
 * and never writes this column; NULL everywhere for V1 rows. Stock moves
 * only at V2 checkout (lock + guard + decrement), mirroring V1's guarantees,
 * and is restored on refund. nullOnDelete: a deleted product leaves the
 * line as a plain labeled line, exactly like sale_items' polymorphic link.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->after('service_id')
                ->constrained('products')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('prestation_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
        });
    }
};
