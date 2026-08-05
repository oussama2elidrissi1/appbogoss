<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Full account & access management — every login-capable account, its role,
 * and whether it's active at all. Gated to `users.manage`, which only the
 * Super Admin role carries (see RolesAndPermissionsSeeder) — deliberately
 * narrower than the rest of the admin surface, since this is what controls
 * who else gets that same authority.
 */
class UserController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function index(): JsonResponse
    {
        $users = User::with('employee')->orderBy('name')->get();

        return response()->json(['data' => UserResource::collection($users)]);
    }

    /**
     * Changes a user's role and/or active status. Never allowed on your own
     * account — the only way to lose or change your own access must be
     * another Super Admin doing it, never an accidental self-lockout.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['sometimes', Rule::in(['super-admin', 'admin', 'employee'])],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($user->id === $request->user()->id && (array_key_exists('role', $validated) || array_key_exists('is_active', $validated))) {
            throw ValidationException::withMessages([
                'role' => 'Vous ne pouvez pas modifier votre propre rôle ou statut depuis cette page.',
            ]);
        }

        $before = $user->only(['role', 'is_active']);

        if (array_key_exists('role', $validated)) {
            $user->syncRoles([$validated['role']]);
        }

        $user->update($validated);

        if (array_key_exists('is_active', $validated)) {
            $user->employee?->update(['is_active' => $validated['is_active']]);
        }

        $this->activityLogger->log('user.access_updated', $user, $before, $validated);

        return response()->json(['data' => new UserResource($user->fresh()->load('employee'))]);
    }

    /**
     * Resets any account's password. Never trusts a client-supplied
     * password comparison — always generates or hashes fresh.
     */
    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        $newPassword = $validated['password'] ?? Str::password(12);
        $user->update(['password' => Hash::make($newPassword)]);

        $this->activityLogger->log('user.password_reset', $user);

        return response()->json(['data' => ['temporary_password' => $newPassword]]);
    }
}
