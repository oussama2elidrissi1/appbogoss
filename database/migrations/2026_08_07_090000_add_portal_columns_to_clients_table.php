<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Columns needed for the client self-service portal. `phone_e164` is a
 * separate normalized column (nullable, unique) rather than a uniqueness
 * constraint on the existing `phone` column — `phone` is free-text and may
 * already hold duplicates/blanks in production, so constraining it directly
 * would fail the migration on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('phone_e164')->nullable()->unique()->after('phone');
            $table->timestamp('phone_verified_at')->nullable()->after('phone_e164');
            $table->string('gender')->nullable()->after('birth_date');
            $table->timestamp('registered_at')->nullable()->after('gender');
            $table->timestamp('consent_terms_at')->nullable()->after('registered_at');
            $table->timestamp('consent_marketing_at')->nullable()->after('consent_terms_at');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn([
                'phone_e164',
                'phone_verified_at',
                'gender',
                'registered_at',
                'consent_terms_at',
                'consent_marketing_at',
            ]);
        });
    }
};
