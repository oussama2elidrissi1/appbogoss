<?php

namespace App\Repositories\Eloquent;

use App\Models\Employee;
use App\Repositories\Contracts\EmployeeRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class EmployeeRepository implements EmployeeRepositoryInterface
{
    public function all(): Collection
    {
        return Employee::all();
    }

    public function find(int $id): ?Employee
    {
        return Employee::find($id);
    }

    public function create(array $data): Employee
    {
        return Employee::create($data);
    }

    public function update(int $id, array $data): ?Employee
    {
        $employee = $this->find($id);

        if (! $employee) {
            return null;
        }

        $employee->update($data);

        return $employee;
    }

    public function delete(int $id): bool
    {
        $employee = $this->find($id);

        return $employee ? (bool) $employee->delete() : false;
    }
}
