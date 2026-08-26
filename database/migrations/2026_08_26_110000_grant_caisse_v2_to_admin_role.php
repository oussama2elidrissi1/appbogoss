<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * V2.1 §17-§18 — the test phase widens from Super Admin to the admin role
 * (caissiers). Admins get the operational set: access, checkout, discount
 * and cancel-of-unpaid — the same trust level caisse.manage already gives
 * them in V1 (they can void tickets there). REFUND stays super-admin only,
 * mirroring V1's prestations.edit_paid rule. Employees get nothing (§18).
 *
 * Idempotent; the seeder carries the same grants for fresh installs.
 */
return new class extends Migration
{
    private const ADMIN_PERMISSIONS = [
        'caisse_v2.access',
        'caisse_v2.checkout',
        'caisse_v2.discount',
        'caisse_v2.cancel',
        // deliberately NOT caisse_v2.refund
    ];

    public function up(): void
    {
        $admin = Role::where('name', 'admin')->where('guard_name', 'web')->first();
        if ($admin !== null) {
            $admin->givePermissionTo(self::ADMIN_PERMISSIONS);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        $admin = Role::where('name', 'admin')->where('guard_name', 'web')->first();
        if ($admin !== null) {
            $admin->revokePermissionTo(self::ADMIN_PERMISSIONS);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
