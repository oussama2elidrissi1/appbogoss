<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pourboires (Caisse V2). Brand-new concept — nothing in V1 ever wrote or
 * read a tip (verified: zero matches repo-wide before this migration).
 *
 * Deliberately its own table, NOT a column on sales/prestations: a tip is
 * voluntary client money for a specific employee and must never blend into
 * revenue (Sale.total), commissions, or the closing report's cash formula.
 * One row per beneficiary — a 50 MAD tip split "Omar 20 / Yassine 30" is two
 * rows on the same prestation.
 *
 * work_day_id is stamped from the day the tip was collected so the V2
 * dashboard can show "Pourboires aujourd'hui" without date arithmetic.
 * Soft deletes: refunding an invoice voids its tips without erasing history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prestation_id')->constrained('prestations')->cascadeOnDelete();
            $table->foreignId('prestation_item_id')->nullable()
                ->constrained('prestation_items')->nullOnDelete();
            $table->foreignId('employee_id')->constrained('employees');
            $table->foreignId('work_day_id')->nullable()->constrained('work_days')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('payment_method', 20)->nullable();
            $table->string('notes')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['work_day_id']);
            $table->index(['employee_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tips');
    }
};
