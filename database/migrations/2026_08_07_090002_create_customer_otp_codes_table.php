<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per OTP send attempt (append-only-ish: rows are marked consumed,
 * never deleted until the cleanup sweep). The code is stored hashed —
 * never in plaintext — same principle as password storage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_otp_codes', function (Blueprint $table) {
            $table->id();
            $table->string('phone_e164');
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->string('code_hash');
            $table->string('purpose')->default('login');
            $table->string('channel')->default('log');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->unsignedTinyInteger('max_attempts')->default(5);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->string('requested_ip', 45)->nullable();
            $table->timestamps();

            $table->index(['phone_e164', 'consumed_at']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_otp_codes');
    }
};
