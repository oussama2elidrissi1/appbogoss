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
        Schema::create('commission_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained();
            $table->string('period', 7); // 'YYYY-MM'
            $table->decimal('commission_total', 10, 2)->default(0);
            $table->decimal('advances_deducted', 10, 2)->default(0);
            $table->decimal('net_amount', 10, 2)->default(0);
            $table->foreignId('paid_by_user_id')->constrained('users');
            $table->timestamp('paid_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            // One payout per employee per calendar month — the hard guard
            // against ever paying the same period twice.
            $table->unique(['employee_id', 'period']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('commission_payouts');
    }
};
