<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ClientResource;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
        ]);
        $query = Client::withCount(['sales', 'appointments'])->orderBy('name');

        // A partner-only account (no Employee record, no caisse.manage/
        // agenda.manage) never sees BOGOSLAND's shared pool or another
        // partner's clients — only their own private portfolio (§3).
        $partner = $request->user()->partner;
        if ($partner !== null && ! $this->isInternalStaff($request)) {
            $query->where('partner_id', $partner->id);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($subQuery) use ($search): void {
                $subQuery
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        return response()->json(['data' => ClientResource::collection($query->get())]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Client::class);

        $client = new Client($this->validated($request));
        $partner = $request->user()->partner;
        // Ownership is always stamped server-side from the authenticated
        // account — never trusts (or even accepts) a client-supplied
        // partner_id, so a partner can never attach a client to someone
        // else's portfolio or to BOGOSLAND's own pool.
        $client->partner_id = $partner?->id;
        $client->created_by_user_id = $request->user()->id;
        $client->save();

        return response()->json(['data' => new ClientResource($client)], 201);
    }

    public function show(Request $request, Client $client): JsonResponse
    {
        $this->authorize('view', $client);
        $client->loadCount(['sales', 'appointments']);

        return response()->json(['data' => new ClientResource($client)]);
    }

    public function update(Request $request, Client $client): JsonResponse
    {
        $this->authorize('update', $client);
        $client->update($this->validated($request, true));

        return response()->json(['data' => new ClientResource($client->refresh()->loadCount(['sales', 'appointments']))]);
    }

    public function destroy(Request $request, Client $client): JsonResponse
    {
        $this->authorize('delete', $client);
        $client->delete();

        return response()->json(status: 204);
    }

    private function isInternalStaff(Request $request): bool
    {
        $user = $request->user();

        return $user->can('caisse.manage') || $user->can('agenda.manage') || $user->employee !== null;
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $presence = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$presence, 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'birth_date' => ['sometimes', 'nullable', 'date', 'before:today'],
            'gender' => ['sometimes', 'nullable', 'in:female,male,other'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'avatar_color' => ['sometimes', 'nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);
    }
}
