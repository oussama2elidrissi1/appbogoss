<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/**
 * Seeds the three fixed system roles (Super Admin, Administrateur/Caissier,
 * Employé) and their permissions. Idempotent: safe to re-run.
 *
 * "employee" intentionally gets no named permissions for editing/confirming
 * money-moving actions — that access is enforced by ownership in
 * PrestationPolicy instead of a flat grant. "loyalty.redeem" is the one
 * exception: PrestationPolicy::update() already requires the employee to own
 * the prestation before they can touch it at all, so granting it just lets
 * the servicing employee attach a client's own reward/subscription usage to
 * their own cart — never someone else's. Quota exceptions
 * (loyalty.override_quota) and program/plan configuration (loyalty.manage)
 * stay admin/super-admin only.
 *
 * The granular loyalty.programs.x / loyalty.rewards.x / subscriptions.x
 * permissions (Phase 2/3) sit alongside the original coarse
 * loyalty.manage/loyalty.redeem/loyalty.override_quota rather than
 * replacing them — those three are still what gate the original Phase 1
 * routes (loyalty-programs/subscription-plans CRUD, prestation item
 * redemption) and are referenced by existing tests; the granular set gates
 * the newer surface (QR/settings/reports/manual adjustments/suspend-extend)
 * so those actions can be delegated independently of full loyalty.manage.
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

            // Original Phase 1 loyalty gates — still authoritative for the
            // routes/controllers/tests that already reference them.
            'loyalty.manage',
            'loyalty.redeem',
            'loyalty.override_quota',

            // Granular Phase 2/3 permissions.
            'loyalty.view',
            'loyalty.programs.view',
            'loyalty.programs.create',
            'loyalty.programs.edit',
            'loyalty.programs.delete',
            'loyalty.rewards.view',
            'loyalty.rewards.adjust',
            'loyalty.rewards.redeem',
            'subscriptions.view',
            'subscriptions.manage',
            'subscriptions.sell',
            'subscriptions.use',
            'subscriptions.suspend',
            'subscriptions.extend',
            'loyalty.reports.view',
            'loyalty.settings.manage',
            'loyalty.qr.manage',
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
            'loyalty.view',
            'loyalty.programs.view',
            'loyalty.programs.create',
            'loyalty.programs.edit',
            'loyalty.rewards.view',
            'loyalty.rewards.redeem',
            'subscriptions.view',
            'subscriptions.manage',
            'subscriptions.sell',
            'subscriptions.use',
            'loyalty.reports.view',
            'loyalty.qr.manage',
            // Not granted to admin: loyalty.programs.delete, loyalty.rewards.adjust,
            // subscriptions.suspend, subscriptions.extend, loyalty.settings.manage —
            // sensitive corrections/config stay super-admin only (§27 vs §28).
        ]);

        $employee = Role::firstOrCreate(['name' => 'employee', 'guard_name' => 'web']);
        $employee->syncPermissions(['loyalty.redeem']);
    }
}
