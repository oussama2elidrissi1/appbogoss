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
            // Restricted agenda surface for partner accounts: they can create
            // reservations and see/edit only their own (scoped in
            // AppointmentController), never the whole salon agenda.
            'agenda.partner',
            'partners.manage',
            'reports.view_all',
            'activity_log.view',
            'settings.manage',
            'users.manage',

            // Cloture mensuelle. `months.close` finalise un mois termine ;
            // `months.history.view` donne acces aux mois clotures, que
            // l'admin ne revoit plus une fois la cloture faite.
            'months.close',
            'months.history.view',

            // Portefeuille. `wallet.view`/`wallet.operate` sont le quotidien
            // d'un admin : il voit son argent et le fait circuler.
            // `wallet.view_all` (l'argent des autres) et `wallet.adjust`
            // (corriger une ecriture) restent au super-admin.
            'wallet.view',
            'wallet.operate',
            'wallet.view_all',
            'wallet.adjust',
            // Les trois gestes ajoutes avec les flux patron/employes.
            // `wallet.deposit` est le seul qui fasse APPARAITRE de l'argent
            // dans le systeme : il reste au patron.
            'wallet.deposit',
            'wallet.dispatch',
            'wallet.pay_employee',

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

            // Caisse (POS) — validée : c'est désormais LA caisse du salon
            // (/pos), l'ancienne n'étant plus au menu. Les noms de
            // permissions restent caisse_v2.* pour ne rien casser. Gardé en
            // phase avec 2026_08_25_100006_seed_caisse_v2_permissions.
            'caisse_v2.access',
            'caisse_v2.checkout',
            'caisse_v2.discount',
            'caisse_v2.cancel',
            'caisse_v2.refund',
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
            'partners.manage',
            'reports.view_all',
            'activity_log.view',
            'settings.manage',
            // Cloturer un mois est un geste d'administration courante ; en
            // relire l'historique ne l'est pas (months.history.view reste au
            // super-admin).
            'months.close',
            'wallet.view',
            'wallet.operate',
            'wallet.pay_employee',
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

            // Caisse — jeu opérationnel complet pour les admins.
            // caisse_v2.refund reste super-admin, comme prestations.edit_paid.
            'caisse_v2.access',
            'caisse_v2.checkout',
            'caisse_v2.discount',
            'caisse_v2.cancel',
            // Not granted to admin: loyalty.programs.delete, loyalty.rewards.adjust,
            // subscriptions.suspend, subscriptions.extend, loyalty.settings.manage —
            // sensitive corrections/config stay super-admin only (§27 vs §28).
        ]);

        $employee = Role::firstOrCreate(['name' => 'employee', 'guard_name' => 'web']);
        $employee->syncPermissions(['loyalty.redeem', 'subscriptions.use']);

        $partner = Role::firstOrCreate(['name' => 'partner', 'guard_name' => 'web']);
        $partner->syncPermissions(['agenda.partner']);
    }
}
