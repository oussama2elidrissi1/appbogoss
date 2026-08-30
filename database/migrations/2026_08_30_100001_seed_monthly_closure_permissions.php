<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * Permissions et mois de démarrage de la clôture mensuelle.
 *
 *  - `months.close`        — Admin + Super Admin. C'est l'admin qui finalise le
 *                            mois ; le super-admin l'obtient de toute façon par
 *                            Gate::before, mais la permission nommée garde les
 *                            routes explicites.
 *  - `months.history.view` — Super Admin seul : relire les mois clôturés.
 *
 * Fixe aussi `closures.start_period` au mois de mise en service. Sans lui, tous
 * les mois depuis l'ouverture du salon remonteraient d'un coup en « à
 * finaliser » — des mois qu'on ne peut plus solder rétroactivement, donc une
 * anomalie permanente à l'écran. Les mois antérieurs gardent leur comportement
 * historique : consultables, jamais listés, sans clôture fictive ni backfill.
 *
 * Écrit au query builder, pas via les modèles Spatie. Deux raisons :
 *
 *  1. règle générale des migrations — elles doivent survivre à un changement
 *     de modèle ou de package, ce qu'un appel à `Role::givePermissionTo()` ne
 *     garantit pas ;
 *  2. raison concrète ici — ce chemin faisait tomber MariaDB 10.4 sous Windows
 *     (exception 0xc0000005, reproductible à 4 s), là où les mêmes écritures en
 *     SQL direct passent sans incident.
 *
 * Idempotent : rejouable sans effet, et un mois de démarrage déjà posé n'est
 * jamais déplacé.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'months.close' => ['super-admin', 'admin'],
        // Volontairement pas l'admin : un mois clôturé quitte ses écrans.
        'months.history.view' => ['super-admin'],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::PERMISSIONS as $permission => $roles) {
            $permissionId = DB::table('permissions')
                ->where('name', $permission)
                ->where('guard_name', 'web')
                ->value('id')
                ?? DB::table('permissions')->insertGetId([
                    'name' => $permission,
                    'guard_name' => 'web',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

            foreach ($roles as $role) {
                $roleId = DB::table('roles')
                    ->where('name', $role)
                    ->where('guard_name', 'web')
                    ->value('id');

                // Rôle absent : installation qui ne l'utilise pas. On passe,
                // le seeder porte les mêmes attributions pour un socle neuf.
                if ($roleId === null) {
                    continue;
                }

                DB::table('role_has_permissions')->insertOrIgnore([
                    'permission_id' => $permissionId,
                    'role_id' => $roleId,
                ]);
            }
        }

        // Sans cet oubli, l'application continuerait de servir sa liste de
        // permissions en cache et ignorerait les deux nouvelles.
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // insertOrIgnore, jamais updateOrInsert : la borne se pose une fois, à
        // l'activation, et ne doit pas se déplacer si la migration est rejouée.
        DB::table('app_settings')->insertOrIgnore([
            'key' => 'closures.start_period',
            'value' => $now->format('Y-m'),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')
            ->whereIn('name', array_keys(self::PERMISSIONS))
            ->where('guard_name', 'web')
            ->pluck('id');

        DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        DB::table('app_settings')->where('key', 'closures.start_period')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
