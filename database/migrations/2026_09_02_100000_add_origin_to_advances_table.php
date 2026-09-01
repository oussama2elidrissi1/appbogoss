<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Distingue l'avance sortie du tiroir de l'avance payée sur le portefeuille.
 *
 * Exactement la même mécanique que `expenses.origin`, et pour exactement la
 * même raison :
 *
 *  - `origin = 'caisse'` — l'avance historique, rattachée à une journée. Elle
 *    est DÉJÀ déduite du résultat de la journée, donc déjà retirée du crédit
 *    que le portefeuille a reçu. La débiter du wallet la compterait deux fois.
 *
 *  - `origin = 'wallet'` — l'avance payée sur l'argent que l'admin détient.
 *    Elle débite le portefeuille, n'a aucune journée de caisse
 *    (`work_day_id` reste nul) et doit rester invisible des agrégats de caisse.
 *
 * Ce qu'elle NE change PAS, et c'est volontaire : une avance wallet reste une
 * OBLIGATION de l'employé. `CommissionPayoutService` la voit toujours dans
 * `outstanding()` et la nette à la paie, quelle que soit la poche d'où elle
 * est sortie. Séparer l'origine de l'obligation est tout l'objet de cette
 * colonne — le portefeuille dit d'où vient l'argent, la paie dit ce qui est dû.
 *
 * Toutes les lignes existantes reçoivent `caisse` par défaut : aucun UPDATE,
 * aucun montant ne bouge.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('advances', function (Blueprint $table) {
            $table->string('origin', 16)->default('caisse')->after('work_day_id');
            $table->index('origin');
        });
    }

    public function down(): void
    {
        Schema::table('advances', function (Blueprint $table) {
            $table->dropIndex(['origin']);
            $table->dropColumn('origin');
        });
    }
};
