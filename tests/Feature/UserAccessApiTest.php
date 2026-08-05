<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserAccessApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    protected function superAdmin(): User
    {
        $user = User::factory()->create(['role' => 'super-admin']);
        $user->assignRole('super-admin');

        return $user;
    }

    protected function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        $user->assignRole('admin');

        return $user;
    }

    public function test_super_admin_can_list_every_account_including_ones_with_no_employee(): void
    {
        $superAdmin = $this->superAdmin();
        $standaloneAdmin = $this->admin();

        Sanctum::actingAs($superAdmin);
        $response = $this->getJson('/api/users');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($superAdmin->id));
        $this->assertTrue($ids->contains($standaloneAdmin->id));
    }

    public function test_admin_role_cannot_access_user_management(): void
    {
        $admin = $this->admin();

        Sanctum::actingAs($admin);
        $this->getJson('/api/users')->assertForbidden();
        $this->patchJson("/api/users/{$admin->id}", ['role' => 'employee'])->assertForbidden();
    }

    public function test_super_admin_can_promote_an_account_to_admin(): void
    {
        $superAdmin = $this->superAdmin();
        $employeeUser = User::factory()->create(['role' => 'employee']);
        $employeeUser->assignRole('employee');

        Sanctum::actingAs($superAdmin);
        $response = $this->patchJson("/api/users/{$employeeUser->id}", ['role' => 'admin']);

        $response->assertOk();
        $this->assertSame('admin', $response->json('data.role'));
        $this->assertSame(['admin'], $response->json('data.roles'));
        $this->assertTrue($employeeUser->fresh()->hasRole('admin'));
        $this->assertFalse($employeeUser->fresh()->hasRole('employee'));
    }

    public function test_super_admin_can_grant_super_admin_to_another_account(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();

        Sanctum::actingAs($superAdmin);
        $response = $this->patchJson("/api/users/{$admin->id}", ['role' => 'super-admin']);

        $response->assertOk();
        $this->assertTrue($admin->fresh()->hasRole('super-admin'));
    }

    public function test_super_admin_can_deactivate_an_account_and_it_cascades_to_its_employee(): void
    {
        $superAdmin = $this->superAdmin();
        $employeeUser = User::factory()->create(['role' => 'employee', 'is_active' => true]);
        $employeeUser->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $employeeUser->id, 'is_active' => true]);

        Sanctum::actingAs($superAdmin);
        $response = $this->patchJson("/api/users/{$employeeUser->id}", ['is_active' => false]);

        $response->assertOk();
        $this->assertFalse($employeeUser->fresh()->is_active);
        $this->assertFalse($employee->fresh()->is_active);
    }

    public function test_super_admin_cannot_change_their_own_role_or_status(): void
    {
        $superAdmin = $this->superAdmin();

        Sanctum::actingAs($superAdmin);

        $roleResponse = $this->patchJson("/api/users/{$superAdmin->id}", ['role' => 'admin']);
        $roleResponse->assertStatus(422);

        $statusResponse = $this->patchJson("/api/users/{$superAdmin->id}", ['is_active' => false]);
        $statusResponse->assertStatus(422);

        $this->assertTrue($superAdmin->fresh()->hasRole('super-admin'));
        $this->assertTrue($superAdmin->fresh()->is_active);
    }

    public function test_super_admin_can_reset_any_accounts_password(): void
    {
        $superAdmin = $this->superAdmin();
        $admin = $this->admin();

        Sanctum::actingAs($superAdmin);
        $response = $this->postJson("/api/users/{$admin->id}/reset-password");

        $response->assertOk();
        $temporaryPassword = $response->json('data.temporary_password');
        $this->assertNotEmpty($temporaryPassword);

        // The stored hash must actually verify against the returned plaintext —
        // guards against a double-hash bug from combining Hash::make() with the
        // model's own 'hashed' cast.
        $this->assertTrue(Hash::check($temporaryPassword, $admin->fresh()->password));
    }
}
