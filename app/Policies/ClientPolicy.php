<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\User;

/**
 * Enforces the client-isolation rule at the backend: BOGOSLAND-owned clients
 * (partner_id null) and internal staff are visible to any authenticated
 * staff account; a partner-only account (no Employee record, no caisse.manage/
 * agenda.manage) may only ever see clients it owns. Mirrors the ownership
 * pattern already used by PrestationPolicy / AppointmentController::
 * restrictedPartner() — never trust the frontend to hide the rest.
 */
class ClientPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Client $client): bool
    {
        if ($this->isInternalStaff($user)) {
            return true;
        }

        $partner = $user->partner;

        return $partner !== null && $client->partner_id === $partner->id;
    }

    public function create(User $user): bool
    {
        return $this->isInternalStaff($user) || $user->partner !== null;
    }

    public function update(User $user, Client $client): bool
    {
        return $this->view($user, $client);
    }

    public function delete(User $user, Client $client): bool
    {
        return $user->can('caisse.manage');
    }

    /** Staff broadly allowed to browse/manage the whole shared client pool. */
    private function isInternalStaff(User $user): bool
    {
        return $user->can('caisse.manage') || $user->can('agenda.manage') || $user->employee !== null;
    }
}
