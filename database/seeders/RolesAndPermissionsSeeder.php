<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Seeds the three fixed system roles (Super Admin, Administrateur/Caissier,
 * Employé) and their permissions. Idempotent: safe to re-run.
 *
 * "employee" intentionally gets no named permissions — an employee's access
 * to their own prestations/commissions is enforced by ownership in
 * PrestationPolicy, not by a flat permission grant.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            'employees.manage',
            'services.manage',
            'commissions.manage',
            'prestations.confirm_payment',
            'prestations.edit_paid',
            'caisse.manage',
            'agenda.manage',
            'reports.view_all',
            'activity_log.view',
            'settings.manage',
            'users.manage',
            'loyalty.manage',
            'loyalty.redeem',
            'loyalty.override_quota',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $superAdmin = Role::firstOrCreate(['name' => 'super-admin', 'guard_name' => 'web']);
        $superAdmin->syncPermissions($permissions);

        $admin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->syncPermissions([
            'employees.manage',
            'services.manage',
            'commissions.manage',
            'prestations.confirm_payment',
            'caisse.manage',
            'agenda.manage',
            'reports.view_all',
            'activity_log.view',
            'settings.manage',
            'loyalty.manage',
            'loyalty.redeem',
        ]);

        Role::firstOrCreate(['name' => 'employee', 'guard_name' => 'web']);
    }
}
