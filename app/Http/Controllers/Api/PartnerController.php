<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePartnerRequest;
use App\Http\Requests\UpdatePartnerRequest;
use App\Http\Resources\PartnerResource;
use App\Models\Partner;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Partner accounts: external businesses allowed to push reservations into
 * the agenda. Each partner gets a dedicated login account (role `partner`)
 * and a per-service commission grid (fixed amount or percentage), both
 * defined at creation time and editable afterwards.
 */
class PartnerController extends Controller
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

        $query = Partner::query()
            ->with(['user', 'commissions.service'])
            ->withCount('appointments')
            ->orderBy('name');

        if (! ($validated['include_inactive'] ?? true)) {
            $query->where('is_active', true);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($subQuery) use ($search): void {
                $subQuery
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('contact_name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        return response()->json(['data' => PartnerResource::collection($query->get())]);
    }

    public function store(StorePartnerRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $password = $validated['login_password'] ?? Str::password(10);

        $partner = DB::transaction(function () use ($validated, $password) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['login_email'],
                'password' => Hash::make($password),
                'role' => 'partner',
                'is_active' => $validated['is_active'] ?? true,
            ]);
            $user->assignRole('partner');

            $partner = Partner::create([
                'name' => $validated['name'],
                'contact_name' => $validated['contact_name'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'email' => $validated['email'] ?? null,
                'address' => $validated['address'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
                'user_id' => $user->id,
            ]);

            $this->syncCommissions($partner, $validated['commissions'] ?? []);

            return $partner;
        });

        $this->activityLogger->log('partner.created', $partner, [], [
            'name' => $partner->name,
            'login_email' => $validated['login_email'],
        ]);

        return response()->json(['data' => [
            'partner' => new PartnerResource($partner->refresh()->load(['user', 'commissions.service'])->loadCount('appointments')),
            'login_email' => $validated['login_email'],
            // Only returned when the password was auto-generated — the admin
            // must be able to hand it over to the partner once.
            'temporary_password' => empty($validated['login_password']) ? $password : null,
        ]], 201);
    }

    public function show(Partner $partner): JsonResponse
    {
        return response()->json(['data' => new PartnerResource(
            $partner->load(['user', 'commissions.service'])->loadCount('appointments'),
        )]);
    }

    public function update(UpdatePartnerRequest $request, Partner $partner): JsonResponse
    {
        $validated = $request->validated();
        $before = $partner->only(['name', 'contact_name', 'phone', 'email', 'address', 'notes', 'is_active']);

        DB::transaction(function () use ($partner, $validated) {
            $partner->update(collect($validated)->only([
                'name', 'contact_name', 'phone', 'email', 'address', 'notes', 'is_active',
            ])->all());

            if ($partner->user) {
                $userUpdates = [];
                if (array_key_exists('name', $validated)) {
                    $userUpdates['name'] = $validated['name'];
                }
                if (! empty($validated['login_email'])) {
                    $userUpdates['email'] = $validated['login_email'];
                }
                if (! empty($validated['login_password'])) {
                    $userUpdates['password'] = Hash::make($validated['login_password']);
                }
                if (array_key_exists('is_active', $validated)) {
                    $userUpdates['is_active'] = $validated['is_active'];
                }
                if ($userUpdates !== []) {
                    $partner->user->update($userUpdates);
                }
            }

            if (array_key_exists('commissions', $validated)) {
                $this->syncCommissions($partner, $validated['commissions']);
            }
        });

        $this->activityLogger->log('partner.updated', $partner, $before, $validated);

        return response()->json(['data' => new PartnerResource(
            $partner->refresh()->load(['user', 'commissions.service'])->loadCount('appointments'),
        )]);
    }

    public function destroy(Partner $partner): JsonResponse
    {
        DB::transaction(function () use ($partner) {
            $user = $partner->user;
            // Reservations survive the partner (history) — explicitly detached
            // rather than relying on the FK's ON DELETE SET NULL, which SQLite
            // test runs don't enforce.
            $partner->appointments()->update(['partner_id' => null]);
            $partner->delete();
            // The login account has no purpose without its partner record.
            $user?->delete();
        });

        $this->activityLogger->log('partner.deleted', $partner);

        return response()->json(status: 204);
    }

    /**
     * Resets the partner's login password. Never trusts a client-supplied
     * comparison — always generates or hashes fresh.
     */
    public function resetPassword(Request $request, Partner $partner): JsonResponse
    {
        if ($partner->user === null) {
            return response()->json(['message' => 'Ce partenaire n’a pas de compte de connexion.'], 422);
        }

        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        $newPassword = $validated['password'] ?? Str::password(12);
        $partner->user->update(['password' => Hash::make($newPassword)]);

        $this->activityLogger->log('partner.password_reset', $partner);

        return response()->json(['data' => ['temporary_password' => $newPassword]]);
    }

    /**
     * Activate/deactivate a partner, cascading to the login account so a
     * disabled partner can no longer authenticate or book.
     */
    public function status(Request $request, Partner $partner): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        DB::transaction(function () use ($partner, $validated) {
            $partner->update(['is_active' => $validated['is_active']]);
            $partner->user?->update(['is_active' => $validated['is_active']]);
        });

        $this->activityLogger->log(
            $validated['is_active'] ? 'partner.activated' : 'partner.deactivated',
            $partner,
        );

        return response()->json(['data' => new PartnerResource(
            $partner->refresh()->load(['user', 'commissions.service'])->loadCount('appointments'),
        )]);
    }

    /**
     * Replaces the partner's commission grid with the submitted one.
     *
     * @param  array<int, array{service_id: int|string, type: string, value: float|int|string}>  $rules
     */
    private function syncCommissions(Partner $partner, array $rules): void
    {
        $keptServiceIds = [];

        foreach ($rules as $rule) {
            $keptServiceIds[] = (int) $rule['service_id'];
            $partner->commissions()->updateOrCreate(
                ['service_id' => (int) $rule['service_id']],
                ['type' => $rule['type'], 'value' => round((float) $rule['value'], 2)],
            );
        }

        $partner->commissions()->whereNotIn('service_id', $keptServiceIds)->delete();
        $partner->unsetRelation('commissions');
    }
}
