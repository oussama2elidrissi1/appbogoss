<?php

namespace App\Repositories\Contracts;

use Illuminate\Database\Eloquent\Collection;
use App\Models\Employee;

interface EmployeeRepositoryInterface
{
    public function all(): Collection;

    public function find(int $id): ?Employee;

    public function create(array $data): Employee;

    public function update(int $id, array $data): ?Employee;

    public function delete(int $id): bool;
}
