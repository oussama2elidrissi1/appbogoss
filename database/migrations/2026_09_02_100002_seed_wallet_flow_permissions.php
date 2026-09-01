<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * Les trois nouveaux gestes financiers.
 *
 *  - `wallet.deposit`      — Super Admin seul : charger son propre portefeuille
 *                            avec de l'argent venu de l'extérieur du salon.
 *                            C'est le seul geste qui fait APPARAÎTRE de
 *                            l'argent dans le système ; il reste donc au
 *                            patron, et il est tracé comme tout le reste.
 *  - `wallet.dispatch`     — Super Admin seul : renvoyer de l'argent à un
 *                            Admin. Le sens inverse du transfert existant.
 *  - `wallet.pay_employee` — Admin + Super Admin : payer un employé sur
 *                            l'argent détenu. C'est de l'exploitation
 *                            courante, pas une prérogative du patron.
 *
 * Écrit au query builder, comme les migrations de permissions précédentes :
 * une migration doit survivre à un changement de modèle, et ce chemin-là est
 * aussi le seul qui ne fasse pas tomber MariaDB 10.4 sous Windows.
 *
 * Idempotent, et n'écrit aucun mouvement financier.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'wallet.deposit' => ['super-admin'],
        'wallet.dispatch' => ['super-admin'],
        'wallet.pay_employee' => ['super-admin', 'admin'],
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
