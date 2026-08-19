<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * §15 (identité entreprise / branding) and §16 (informations de paiement)
     * of the partner portal spec — all nullable, purely additive. Payment
     * fields are never exposed through the default admin list resource (see
     * PartnerDetailResource), only on the partner's own profile screen and
     * the single-partner admin fiche.
     */
    public function up(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->string('trade_name')->nullable()->after('name');
            $table->string('legal_name')->nullable()->after('trade_name');
            $table->string('ice', 50)->nullable()->after('legal_name');
            $table->string('city')->nullable()->after('address');
            $table->string('country')->nullable()->after('city');
            $table->string('logo_url')->nullable()->after('country');

            $table->string('payment_holder_name')->nullable()->after('notes');
            $table->string('payment_bank_name')->nullable()->after('payment_holder_name');
            $table->string('payment_iban')->nullable()->after('payment_bank_name');
            $table->string('payment_method_preference', 50)->nullable()->after('payment_iban');
        });
    }

    public function down(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->dropColumn([
                'trade_name', 'legal_name', 'ice', 'city', 'country', 'logo_url',
                'payment_holder_name', 'payment_bank_name', 'payment_iban', 'payment_method_preference',
            ]);
        });
    }
};
