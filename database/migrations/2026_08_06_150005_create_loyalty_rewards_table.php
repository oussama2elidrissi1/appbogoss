<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('loyalty_program_id')->constrained()->cascadeOnDelete();
            $table->foreignId('triggering_ledger_entry_id')->nullable()->constrained('loyalty_ledger_entries')->nullOnDelete();
            $table->json('program_snapshot')->nullable();
            $table->string('type');
            $table->string('status')->default('available');
            $table->foreignId('service_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('value', 10, 2)->nullable();
            $table->string('commission_basis')->nullable();
            $table->decimal('commission_value', 10, 2)->nullable();
            $table->foreignId('reserved_prestation_id')->nullable()->constrained('prestations')->nullOnDelete();
            $table->foreignId('used_prestation_item_id')->nullable()->constrained('prestation_items')->nullOnDelete();
            $table->timestamp('generated_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('used_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_rewards');
    }
};
