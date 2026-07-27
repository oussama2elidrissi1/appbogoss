<?php

namespace App\Repositories\Contracts;

use Illuminate\Database\Eloquent\Collection;
use App\Models\Expense;

interface ExpenseRepositoryInterface
{
    public function all(): Collection;

    public function find(int $id): ?Expense;

    public function create(array $data): Expense;

    public function update(int $id, array $data): ?Expense;

    public function delete(int $id): bool;
}
