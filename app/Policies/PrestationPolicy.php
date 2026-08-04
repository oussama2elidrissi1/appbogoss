<?php

namespace App\Policies;

use App\Models\Prestation;
use App\Models\User;

class PrestationPolicy
{
    /** Any authenticated user may list prestations — the controller scopes the query to "own" for employees. */
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Prestation $prestation): bool
    {
        return $this->isOwner($user, $prestation) || $user->can('caisse.manage') || $user->can('reports.view_all');
    }

    public function create(User $user): bool
    {
        return $user->employee !== null || $user->hasRole('super-admin');
    }

    /** Editing service lines — only the owning employee, and only before it reaches the caisse. */
    public function update(User $user, Prestation $prestation): bool
    {
        return $this->isOwner($user, $prestation) && $prestation->isEditableByEmployee();
    }

    public function cancel(User $user, Prestation $prestation): bool
    {
        return $this->isOwner($user, $prestation) || $user->can('caisse.manage');
    }

    private function isOwner(User $user, Prestation $prestation): bool
    {
        return $user->employee !== null && $user->employee->id === $prestation->employee_id;
    }
}
