<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rendez-vous nes hors de l'application — aujourd'hui les reservations du site
 * bogosland.com (plugin WordPress), importees dans l'agenda.
 *
 *  - external_ref : reference de la reservation d'origine (« wp:108 »).
 *    Unique : un passage d'import rejoue deux fois ne cree jamais de doublon.
 *  - external_status : dernier statut du site deja synchronise. C'est lui qui
 *    dit quel cote a change depuis le dernier passage (voir
 *    App\Services\SiteReservationSync).
 *
 * Nullable : les rendez-vous existants ne sont pas concernes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->string('external_ref', 64)->nullable()->unique()->after('source');
            $table->string('external_status', 20)->nullable()->after('external_ref');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropUnique(['external_ref']);
            $table->dropColumn(['external_ref', 'external_status']);
        });
    }
};
