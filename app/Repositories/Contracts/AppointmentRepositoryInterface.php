<?php

namespace App\Repositories\Contracts;

use Illuminate\Database\Eloquent\Collection;
use App\Models\Appointment;

interface AppointmentRepositoryInterface
{
    public function all(): Collection;

    public function find(int $id): ?Appointment;

    public function create(array $data): Appointment;

    public function update(int $id, array $data): ?Appointment;

    public function delete(int $id): bool;
}
