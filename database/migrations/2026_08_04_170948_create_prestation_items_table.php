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
        Schema::create('prestation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prestation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 10, 2);
            $table->unsignedInteger('duration_minutes')->nullable();
            $table->string('notes')->nullable();
            $table->string('commission_type')->nullable();
            $table->decimal('commission_value', 8, 2)->nullable();
            $table->decimal('commission_amount', 10, 2)->nullable();
            $table->foreignId('commission_rule_id')->nullable()->constrained('employee_service_commissions')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prestation_items');
    }
};
