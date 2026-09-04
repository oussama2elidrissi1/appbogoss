<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * D'où vient chaque réservation : le canal de création.
 *
 * Valeurs : `web_admin` (agenda staff — web ou mobile employé, même
 * endpoint), `partner` (portail partenaire), `mobile_public` (application
 * mobile publique, nouveau canal), plus tard `pos` si la caisse crée un jour
 * des réservations.
 *
 * Rétro-compatible : colonne nullable, aucune valeur requise. Le backfill
 * reflète ce que les données disent déjà — une réservation portant un
 * partner_id est venue du canal partenaire, tout le reste a été créé par le
 * staff via l'agenda. Aucune réservation existante n'est modifiée au-delà de
 * cette étiquette.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->string('source', 32)->nullable()->after('status');
            $table->index('source');
        });

        DB::table('appointments')->whereNotNull('partner_id')->update(['source' => 'partner']);
        DB::table('appointments')->whereNull('partner_id')->update(['source' => 'web_admin']);
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropIndex(['source']);
            $table->dropColumn('source');
        });
    }
};
