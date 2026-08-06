<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_program_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('loyalty_program_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('counter')->default(0);
            $table->unsignedInteger('points_balance')->default(0);
            $table->decimal('amount_accumulated', 10, 2)->default(0);
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamps();

            $table->unique(['client_id', 'loyalty_program_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_program_progress');
    }
};
