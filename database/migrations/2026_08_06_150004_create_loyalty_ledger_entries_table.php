<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('loyalty_program_id')->constrained()->cascadeOnDelete();
            $table->string('direction');
            $table->string('metric');
            $table->decimal('delta', 10, 2);
            $table->string('sourceable_type');
            $table->unsignedBigInteger('sourceable_id');
            $table->string('reason')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->unique(
                ['sourceable_type', 'sourceable_id', 'loyalty_program_id', 'direction'],
                'loyalty_ledger_idempotency_unique'
            );
            $table->index(['sourceable_type', 'sourceable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_ledger_entries');
    }
};
