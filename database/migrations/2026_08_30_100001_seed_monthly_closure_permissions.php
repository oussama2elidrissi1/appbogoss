<?php

use App\Models\AppSetting;
use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Permissions and start period for the monthly closure.
 *
 *  - `months.close`        — Admin + Super Admin. It is the admin who finishes
 *                            the month; the super-admin inherits it anyway
 *                            through Gate::before, but the named permission
 *                            keeps the routes explicit.
 *  - `months.history.view` — Super Admin only: reading closed months.
 *
 * Also pins `closures.start_period` to the month the feature goes live. Without
 * it every month since the salon opened would surface as "to finalise" the
 * moment this ships — months that can no longer be settled retroactively, so
 * the UI would show a permanent anomaly. Months before the start period keep
 * their historical behaviour: consultable, never listed, never closed, and no
 * backfill or fake closure is written for them.
 *
 * Idempotent: re-running changes nothing, and an existing start period is
 * never overwritten (re-running months later must not move the boundary).
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'months.close',
        'months.history.view',
    ];

    private const ADMIN_PERMISSIONS = [
        'months.close',
        // deliberately NOT months.history.view — closed months leave the
        // admin's screens for good.
    ];

    public function up(): void
    {
        foreach (self::PERMISSIONS as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $superAdmin = Role::where('name', 'super-admin')->where('guard_name', 'web')->first();
        $superAdmin?->givePermissionTo(self::PERMISSIONS);

        $admin = Role::where('name', 'admin')->where('guard_name', 'web')->first();
        $admin?->givePermissionTo(self::ADMIN_PERMISSIONS);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // firstOrCreate, never updateOrCreate: the boundary is set once, at
        // activation, and must not drift if this migration is ever replayed.
        AppSetting::firstOrCreate(
            ['key' => 'closures.start_period'],
            ['value' => now()->format('Y-m')],
        );
    }

    public function down(): void
    {
        $superAdmin = Role::where('name', 'super-admin')->where('guard_name', 'web')->first();
        $superAdmin?->revokePermissionTo(self::PERMISSIONS);

        $admin = Role::where('name', 'admin')->where('guard_name', 'web')->first();
        $admin?->revokePermissionTo(self::ADMIN_PERMISSIONS);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        AppSetting::where('key', 'closures.start_period')->delete();
    }
};
