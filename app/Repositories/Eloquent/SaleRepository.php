<?php

namespace App\Repositories\Eloquent;

use App\Models\Sale;
use App\Repositories\Contracts\SaleRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class SaleRepository implements SaleRepositoryInterface
{
    public function all(): Collection
    {
        return Sale::all();
    }

    public function find(int $id): ?Sale
    {
        return Sale::find($id);
    }

    public function create(array $data): Sale
    {
        return Sale::create($data);
    }

    public function update(int $id, array $data): ?Sale
    {
        $sale = $this->find($id);

        if (! $sale) {
            return null;
        }

        $sale->update($data);

        return $sale;
    }

    public function delete(int $id): bool
    {
        $sale = $this->find($id);

        return $sale ? (bool) $sale->delete() : false;
    }
}
