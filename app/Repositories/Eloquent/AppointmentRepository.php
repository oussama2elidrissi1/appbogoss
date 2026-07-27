<?php

namespace App\Repositories\Eloquent;

use App\Models\Appointment;
use App\Repositories\Contracts\AppointmentRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class AppointmentRepository implements AppointmentRepositoryInterface
{
    public function all(): Collection
    {
        return Appointment::all();
    }

    public function find(int $id): ?Appointment
    {
        return Appointment::find($id);
    }

    public function create(array $data): Appointment
    {
        return Appointment::create($data);
    }

    public function update(int $id, array $data): ?Appointment
    {
        $appointment = $this->find($id);

        if (! $appointment) {
            return null;
        }

        $appointment->update($data);

        return $appointment;
    }

    public function delete(int $id): bool
    {
        $appointment = $this->find($id);

        return $appointment ? (bool) $appointment->delete() : false;
    }
}
