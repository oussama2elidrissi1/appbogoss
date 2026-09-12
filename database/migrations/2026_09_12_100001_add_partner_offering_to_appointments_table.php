<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * De quelle OFFRE est nee cette reservation.
 *
 * `appointments.partner_id` dit deja a qui elle appartient ; cette colonne dit
 * ce qui a ete vendu. Elle est indispensable pour deux raisons :
 *
 *  - un pack se realise en plusieurs prestations ; sans ce lien, impossible de
 *    retrouver la commission negociee du PACK au moment de l'encaissement, on
 *    ne verrait que des services isoles ;
 *  - elle garde la trace du prix affiche au client, meme si la vitrine du
 *    partenaire change ensuite.
 *
 * Nullable et `nullOnDelete` : toutes les reservations existantes restent
 * valides, et supprimer une offre n'efface pas l'historique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->foreignId('partner_offering_id')->nullable()->after('partner_id')
                ->constrained('partner_offerings')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('partner_offering_id');
        });
    }
};
