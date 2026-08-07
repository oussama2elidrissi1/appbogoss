<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Personal identification QR (never a "loyalty card") — the QR encodes only
 * this random token, never the client id/name/phone/points. One active
 * token per client (revoke-and-replace on regenerate, old rows kept for
 * audit rather than deleted).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_qr_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['client_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_qr_tokens');
    }
};
