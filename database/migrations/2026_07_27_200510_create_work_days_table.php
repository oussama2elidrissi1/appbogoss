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
        Schema::create('work_days', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->foreignId('opened_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('opening_balance', 10, 2)->default(0);
            $table->string('status')->default('open');
            $table->timestamp('closed_at')->nullable();
            $table->json('closing_report')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('work_days');
    }
};
