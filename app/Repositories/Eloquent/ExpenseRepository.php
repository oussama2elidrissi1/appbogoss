<?php

namespace App\Repositories\Eloquent;

use App\Models\Expense;
use App\Repositories\Contracts\ExpenseRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class ExpenseRepository implements ExpenseRepositoryInterface
{
    public function all(): Collection
    {
        return Expense::all();
    }

    public function find(int $id): ?Expense
    {
        return Expense::find($id);
    }

    public function create(array $data): Expense
    {
        return Expense::create($data);
    }

    public function update(int $id, array $data): ?Expense
    {
        $expense = $this->find($id);

        if (! $expense) {
            return null;
        }

        $expense->update($data);

        return $expense;
    }

    public function delete(int $id): bool
    {
        $expense = $this->find($id);

        return $expense ? (bool) $expense->delete() : false;
    }
}
