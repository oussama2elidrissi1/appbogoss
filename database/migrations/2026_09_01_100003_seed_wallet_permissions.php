<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * Permissions du portefeuille.
 *
 *  - `wallet.view`     — Admin + Super Admin : voir SON portefeuille.
 *  - `wallet.operate`  — Admin + Super Admin : envoyer au patron, saisir une
 *                        dépense, affecter ou reprendre un fond de caisse.
 *  - `wallet.view_all` — Super Admin seul : la vue financière globale et
 *                        l'historique de n'importe quel admin.
 *  - `wallet.adjust`   — Super Admin seul : écrire un ajustement ou contre-passer
 *                        un mouvement. Jamais une suppression : la correction
 *                        s'ajoute au ledger, elle n'en retire rien.
 *
 * Écrit au query builder et non via les modèles Spatie, pour la même raison que
 * la migration des permissions de clôture mensuelle : une migration doit
 * survivre à un changement de modèle, et ce chemin-là faisait tomber MariaDB
 * 10.4 sous Windows.
 *
 * Idempotent : rejouable sans effet. N'écrit AUCUN mouvement financier — les
 * portefeuilles naissent vides et le resteront tant qu'une journée de caisse du
 * 1er septembre 2026 ou plus tard ne sera pas clôturée.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'wallet.view' => ['super-admin', 'admin'],
        'wallet.operate' => ['super-admin', 'admin'],
        // Volontairement pas l'admin : voir l'argent détenu par les autres
        // admins n'est pas de l'administration courante.
        'wallet.view_all' => ['super-admin'],
        'wallet.adjust' => ['super-admin'],
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

                // Rôle absent : installation qui ne l'utilise pas. Le seeder
                // porte les mêmes attributions pour un socle neuf.
                if ($roleId === null) {
                    continue;
                }

                DB::table('role_has_permissions')->insertOrIgnore([
                    'permission_id' => $permissionId,
                    'role_id' => $roleId,
                ]);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')
            ->whereIn('name', array_keys(self::PERMISSIONS))
            ->where('guard_name', 'web')
            ->pluck('id');

        DB::table('role_has_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
