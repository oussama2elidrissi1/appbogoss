<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Le journal de statut doit pouvoir dire « personne » : une réservation créée
 * depuis l'application mobile publique naît sans utilisateur — c'est le
 * client lui-même qui agit. Assouplissement rétro-compatible : toutes les
 * lignes existantes gardent leur auteur, seule la contrainte NOT NULL tombe.
 *
 * En SQL brut pour MySQL/MariaDB, PAS via `->change()` : l'introspection
 * doctrine/dbal (requête information_schema avec sous-requête
 * CHECK_CONSTRAINTS) fait s'effondrer MariaDB 10.4 sous Windows — le même
 * écueil que les migrations de permissions ont déjà contourné. SQLite (la
 * suite de tests) passe par la reconstruction de table du schéma Laravel,
 * qui ne touche pas ce chemin.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('appointment_status_logs', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable()->change();
            });

            return;
        }

        DB::statement('ALTER TABLE appointment_status_logs MODIFY user_id BIGINT UNSIGNED NULL');
    }

    public function down(): void
    {
        // Pas de retour en arrière : re-NOT NULL casserait les journaux des
        // réservations publiques déjà écrites.
    }
};
