<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Le rôle du compte de validation Google Play : `google_reviewer`.
 *
 * Volontairement créé SANS AUCUNE permission nommée. L'interface employé
 * repose sur deux choses seulement : être authentifié et posséder une fiche
 * Employee liée (PrestationPolicy::create, routes /me/*). Un rôle vide donne
 * donc exactement l'expérience employé — et rien d'autre : chaque écran ou
 * endpoint gardé par une permission (caisse, paie, portefeuille, réglages,
 * rapports…) répond déjà 403 sans qu'on ait quoi que ce soit à interdire.
 *
 * Ce qui reste — les écritures que possède tout porteur de fiche employé —
 * est restreint par le middleware ReviewerSandbox, côté serveur.
 *
 * Aucune logique par adresse email nulle part : le rôle EST l'identité.
 * Idempotent, rejouable, ne touche aucune donnée existante.
 */
return new class extends Migration
{
    public function up(): void
    {
        $exists = DB::table('roles')
            ->where('name', 'google_reviewer')
            ->where('guard_name', 'web')
            ->exists();

        if (! $exists) {
            DB::table('roles')->insert([
                'name' => 'google_reviewer',
                'guard_name' => 'web',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        // Ne supprime pas le rôle : un down ne doit pas orpheliner un compte
        // existant. La suppression, si un jour voulue, se fait à la main.
    }
};
