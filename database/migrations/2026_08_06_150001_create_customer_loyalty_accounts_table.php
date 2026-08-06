<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_loyalty_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('points_balance')->default(0);
            $table->string('status')->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_loyalty_accounts');
    }
};
