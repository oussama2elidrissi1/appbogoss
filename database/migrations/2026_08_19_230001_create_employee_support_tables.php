<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_support_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('subject');
            $table->string('category')->nullable();
            $table->string('status', 24)->default('nouveau');
            $table->timestamp('employee_last_read_at')->nullable();
            $table->timestamp('admin_last_read_at')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'last_message_at']);
        });

        Schema::create('employee_support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')
                ->constrained('employee_support_conversations')
                ->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_support_messages');
        Schema::dropIfExists('employee_support_conversations');
    }
};
