<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prestation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('prestation_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained();
            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('rule_id')->nullable()->constrained('employee_service_commissions')->nullOnDelete();
            $table->string('type'); // percentage | fixed | none
            $table->decimal('rate_or_amount', 8, 2)->default(0);
            $table->decimal('base_amount', 10, 2)->default(0);
            $table->decimal('amount', 10, 2)->default(0);
            $table->string('status')->default('validated'); // validated | cancelled
            $table->timestamps();

            $table->index(['employee_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('commissions');
    }
};
