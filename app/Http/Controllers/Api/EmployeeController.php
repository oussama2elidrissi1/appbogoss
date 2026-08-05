<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEmployeeRequest;
use App\Http\Requests\UpdateEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class EmployeeController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'include_inactive' => ['sometimes', 'boolean'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Employee::query()->with('user')->where('is_company', false)->orderBy('name');

        if (! ($validated['include_inactive'] ?? false)) {
            $query->where('is_active', true);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($subQuery) use ($search): void {
                $subQuery
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('role', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        return response()->json(['data' => EmployeeResource::collection($query->get())]);
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $accountFields = $this->extractAccountFields($validated);
        $data = $this->normalize($validated, true);

        $employee = DB::transaction(function () use ($data, $accountFields) {
            $employee = Employee::create($data);

            if (! empty($accountFields['login_email'])) {
                $this->createOrUpdateAccount($employee, $accountFields);
            }

            return $employee;
        });

        $this->activityLogger->log('employee.created', $employee, [], $data);

        return response()->json(['data' => new EmployeeResource($employee->refresh()->load('user'))], 201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return response()->json(['data' => new EmployeeResource($employee->load('user'))]);
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $validated = $request->validated();
        $accountFields = $this->extractAccountFields($validated);
        $data = $this->normalize($validated);
        $before = $employee->only(array_keys($data));

        DB::transaction(function () use ($employee, $data, $accountFields) {
            $employee->update($data);

            if (array_key_exists('is_active', $data)) {
                $employee->user?->update(['is_active' => $data['is_active']]);
            }

            if (! empty($accountFields['login_email']) || ! empty($accountFields['system_role'])) {
                $this->createOrUpdateAccount($employee, $accountFields);
            }
        });

        $this->activityLogger->log('employee.updated', $employee, $before, $data);

        return response()->json(['data' => new EmployeeResource($employee->refresh()->load('user'))]);
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $employee->delete();

        return response()->json(status: 204);
    }

    /**
     * Reset the password of an employee's linked login account.
     * Never trusts a client-supplied password comparison — always hashes fresh.
     */
    public function resetPassword(Request $request, Employee $employee): JsonResponse
    {
        if ($employee->user_id === null) {
            return response()->json(['message' => 'Cet employé n’a pas de compte de connexion.'], 422);
        }

        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        $newPassword = $validated['password'] ?? Str::password(12);

        $employee->user->update(['password' => Hash::make($newPassword)]);

        $this->activityLogger->log('employee.password_reset', $employee);

        return response()->json(['data' => ['temporary_password' => $newPassword]]);
    }

    /**
     * One-click account creation: auto-generates a unique login email from the
     * employee's name and a random password, so an admin never has to type
     * anything by hand for an employee who already exists (with their full
     * history of prestations/ventes/avances already tied to their employee_id —
     * linking a login account only adds a way in, it never touches that history).
     */
    public function quickCreateAccount(Employee $employee): JsonResponse
    {
        if ($employee->user_id !== null) {
            return response()->json(['message' => 'Cet employé a déjà un compte de connexion.'], 422);
        }

        $slug = Str::slug($employee->name, '.') ?: 'employe';
        $email = "{$slug}@bogosland.com";
        $suffix = 1;
        while (User::where('email', $email)->exists()) {
            $suffix++;
            $email = "{$slug}{$suffix}@bogosland.com";
        }
        $password = Str::password(10);

        $this->createOrUpdateAccount($employee, [
            'login_email' => $email,
            'login_password' => $password,
            'system_role' => 'employee',
        ]);

        $this->activityLogger->log('employee.account_created', $employee, [], ['login_email' => $email]);

        return response()->json(['data' => [
            'login_email' => $email,
            'temporary_password' => $password,
            'employee' => new EmployeeResource($employee->refresh()->load('user')),
        ]]);
    }

    /**
     * Activate/deactivate an employee, cascading to their linked login account
     * so a disabled employee is also locked out of authentication.
     */
    public function status(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        DB::transaction(function () use ($employee, $validated) {
            $employee->update(['is_active' => $validated['is_active']]);
            $employee->user?->update(['is_active' => $validated['is_active']]);
        });

        $this->activityLogger->log(
            $validated['is_active'] ? 'employee.activated' : 'employee.deactivated',
            $employee,
        );

        return response()->json(['data' => new EmployeeResource($employee->refresh()->load('user'))]);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function extractAccountFields(array $validated): array
    {
        return [
            'login_email' => $validated['login_email'] ?? null,
            'login_password' => $validated['login_password'] ?? null,
            'system_role' => $validated['system_role'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $accountFields
     */
    private function createOrUpdateAccount(Employee $employee, array $accountFields): void
    {
        $role = $accountFields['system_role'] ?? 'employee';

        if ($employee->user_id === null) {
            $user = User::create([
                'name' => $employee->name,
                'email' => $accountFields['login_email'],
                'password' => Hash::make($accountFields['login_password'] ?? Str::password(12)),
                'role' => $role,
                'is_active' => $employee->is_active,
            ]);
            $user->assignRole($role);
            $employee->update(['user_id' => $user->id]);

            return;
        }

        $user = $employee->user;
        $updates = ['role' => $role];

        if (! empty($accountFields['login_email'])) {
            $updates['email'] = $accountFields['login_email'];
        }

        if (! empty($accountFields['login_password'])) {
            $updates['password'] = Hash::make($accountFields['login_password']);
        }

        $user->update($updates);
        $user->syncRoles([$role]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $creating = false): array
    {
        unset($data['login_email'], $data['login_password'], $data['system_role']);

        if (array_key_exists('email', $data) && $data['email'] === '') {
            $data['email'] = null;
        }

        if (array_key_exists('phone', $data) && $data['phone'] === '') {
            $data['phone'] = null;
        }

        if (($creating && ! array_key_exists('avatar_color', $data)) || (array_key_exists('avatar_color', $data) && $data['avatar_color'] === null)) {
            $data['avatar_color'] = '#C8A24C';
        }

        if ($creating && ! array_key_exists('is_active', $data)) {
            $data['is_active'] = true;
        }

        if ($creating || array_key_exists('specialties', $data)) {
            $data['specialties'] = array_values(array_filter(
                $data['specialties'] ?? [],
                fn ($specialty) => filled($specialty),
            ));
        }

        if ($creating || array_key_exists('service_categories', $data)) {
            $data['service_categories'] = array_values(array_unique(array_filter(
                $data['service_categories'] ?? [],
                fn ($category) => filled($category),
            )));
        }

        if ($creating || array_key_exists('allowed_service_ids', $data)) {
            $data['allowed_service_ids'] = array_values(array_unique(array_map(
                fn ($id) => (int) $id,
                $data['allowed_service_ids'] ?? [],
            )));
        }

        return $data;
    }
}
