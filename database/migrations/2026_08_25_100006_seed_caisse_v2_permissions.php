<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Caisse V2 permissions — shipped as a migration so production picks them up
 * on `php artisan migrate` without needing a manual seeder run. Idempotent
 * (firstOrCreate), and RolesAndPermissionsSeeder carries the same list for
 * fresh installs.
 *
 * TEST-PHASE GATING (§52): only super-admin receives them. The Gate::before
 * bypass would let super-admin through regardless — the explicit grant is
 * for legibility in the roles UI. Admin/employee/partner get NOTHING here;
 * they keep using Caisse V1 until the switch is decided, at which point the
 * grant can be widened via the seeder or the users screen.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'caisse_v2.access',
        'caisse_v2.checkout',
        'caisse_v2.discount',
        'caisse_v2.cancel',
        'caisse_v2.refund',
    ];

    public function up(): void
    {
        foreach (self::PERMISSIONS as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $superAdmin = Role::where('name', 'super-admin')->where('guard_name', 'web')->first();
        if ($superAdmin !== null) {
            $superAdmin->givePermissionTo(self::PERMISSIONS);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::whereIn('name', self::PERMISSIONS)->where('guard_name', 'web')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
