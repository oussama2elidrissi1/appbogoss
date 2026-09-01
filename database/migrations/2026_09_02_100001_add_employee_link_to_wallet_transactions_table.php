<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rattache un mouvement de portefeuille à un employé.
 *
 * Une colonne dédiée plutôt que la source polymorphe, pour une raison précise :
 * « ouvrir un employé et voir tout ce qu'il a reçu » est une question posée
 * DANS L'AUTRE SENS. Avec la seule source morphique, il faudrait chercher les
 * avances de cet employé puis les mouvements qui les pointent — deux requêtes
 * et un cas non couvert (un salaire n'a aucune source). Une colonne indexée
 * répond en une requête, et couvre tous les motifs de paiement.
 *
 * `period` est le mois que le paiement solde (« 2026-08 » pour un salaire
 * d'août payé en septembre). C'est une ÉTIQUETTE, pas une date : le mouvement
 * d'argent, lui, est daté par `occurred_at`. Cette distinction est ce qui
 * permet de payer en septembre une obligation d'août sans que le portefeuille
 * ait à remonter le temps.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->after('performed_by_user_id')
                ->constrained()->nullOnDelete();
            $table->string('period', 7)->nullable()->after('employee_id');

            $table->index(['employee_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropIndex(['employee_id', 'occurred_at']);
            $table->dropConstrainedForeignId('employee_id');
            $table->dropColumn('period');
        });
    }
};
