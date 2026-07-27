<?php

namespace App\Repositories\Contracts;

use Illuminate\Database\Eloquent\Collection;
use App\Models\Sale;

interface SaleRepositoryInterface
{
    public function all(): Collection;

    public function find(int $id): ?Sale;

    public function create(array $data): Sale;

    public function update(int $id, array $data): ?Sale;

    public function delete(int $id): bool;
}
