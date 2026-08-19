<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePartnerRequest;
use App\Http\Requests\UpdatePartnerRequest;
use App\Http\Resources\PartnerDetailResource;
use App\Http\Resources\PartnerResource;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
                'trade_name' => $validated['trade_name'] ?? null,
                'legal_name' => $validated['legal_name'] ?? null,
                'ice' => $validated['ice'] ?? null,
                'contact_name' => $validated['contact_name'] ?? null,
                'phone' => $validated['phone'] ?? null,
                'email' => $validated['email'] ?? null,
                'address' => $validated['address'] ?? null,
                'city' => $validated['city'] ?? null,
                'country' => $validated['country'] ?? null,
                'payment_holder_name' => $validated['payment_holder_name'] ?? null,
                'payment_bank_name' => $validated['payment_bank_name'] ?? null,
                'payment_iban' => $validated['payment_iban'] ?? null,
                'payment_method_preference' => $validated['payment_method_preference'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'status' => $validated['status'] ?? (($validated['is_active'] ?? true) ? Partner::STATUS_ACTIVE : Partner::STATUS_DISABLED),
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

    /**
     * Admin fiche partenaire (§19) — identity/business/payment fields plus
     * performance aggregates: clients apportés, réservations (total +
     * confirmées), CA généré, commission totale, commission encore due. All
     * read from persisted rows (Appointment, Client, PartnerCommission), not
     * a recomputed estimate — §27.
     */
    public function show(Partner $partner): JsonResponse
    {
        $partner->load(['user', 'commissions.service'])->loadCount('appointments');

        $clientsCount = Client::where('partner_id', $partner->id)->count();
        $confirmedCount = Appointment::where('partner_id', $partner->id)->where('status', 'confirmed')->count();
        $ledger = PartnerCommission::where('partner_id', $partner->id)
            ->where('status', '!=', PartnerCommission::STATUS_CANCELLED)
            ->selectRaw('sum(base_amount) as revenue, sum(amount) as commission_total')
            ->first();
        $due = (float) PartnerCommission::where('partner_id', $partner->id)
            ->where('status', PartnerCommission::STATUS_VALIDATED)
            ->sum('amount');

        return response()->json(['data' => array_merge((new PartnerDetailResource($partner))->toArray(request()), [
            'performance' => [
                'clients_count' => $clientsCount,
                'appointments_count' => $partner->appointments_count,
                'appointments_confirmed_count' => $confirmedCount,
                'revenue_generated' => round((float) ($ledger->revenue ?? 0), 2),
                'commission_total' => round((float) ($ledger->commission_total ?? 0), 2),
                'commission_due' => round($due, 2),
            ],
        ])]);
    }

    public function update(UpdatePartnerRequest $request, Partner $partner): JsonResponse
    {
        $validated = $request->validated();
        $before = $partner->only(['name', 'contact_name', 'phone', 'email', 'address', 'notes', 'is_active', 'status']);

        $updatableFields = [
            'name', 'trade_name', 'legal_name', 'ice', 'contact_name', 'phone', 'email',
            'address', 'city', 'country', 'notes', 'is_active', 'status',
            'payment_holder_name', 'payment_bank_name', 'payment_iban', 'payment_method_preference',
        ];

        DB::transaction(function () use ($partner, $validated, $updatableFields) {
            $partner->update(collect($validated)->only($updatableFields)->all());

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
                // A `status` of pending/suspended is a business-state
                // restriction, not a login lockout — only active/disabled
                // (or the legacy `is_active` boolean) toggle the login
                // account itself, mirroring status().
                if (array_key_exists('status', $validated) && in_array($validated['status'], [Partner::STATUS_ACTIVE, Partner::STATUS_DISABLED], true)) {
                    $userUpdates['is_active'] = $validated['status'] === Partner::STATUS_ACTIVE;
                } elseif (array_key_exists('is_active', $validated)) {
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

        return response()->json(['data' => new PartnerDetailResource(
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
     * Sets the partner's lifecycle status (§17: pending/active/suspended/
     * disabled). Only active↔disabled toggles the login account itself —
     * a suspended or pending partner can still sign in and see their own
     * portal (booking creation alone is blocked, in AppointmentController);
     * `is_active` is still accepted as a legacy boolean shortcut for
     * active/disabled.
     */
    public function status(Request $request, Partner $partner): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required_without:is_active', Rule::in(['pending', 'active', 'suspended', 'disabled'])],
            'is_active' => ['required_without:status', 'boolean'],
        ]);

        $status = $validated['status'] ?? ($validated['is_active'] ? Partner::STATUS_ACTIVE : Partner::STATUS_DISABLED);

        DB::transaction(function () use ($partner, $status) {
            $partner->update(['status' => $status]);
            if (in_array($status, [Partner::STATUS_ACTIVE, Partner::STATUS_DISABLED], true)) {
                $partner->user?->update(['is_active' => $status === Partner::STATUS_ACTIVE]);
            }
        });

        $this->activityLogger->log('partner.status_changed', $partner, [], ['status' => $status]);

        return response()->json(['data' => new PartnerDetailResource(
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
