<?php

namespace App\Repositories\Contracts;

use Illuminate\Database\Eloquent\Collection;
use App\Models\Client;

interface ClientRepositoryInterface
{
    public function all(): Collection;

    public function find(int $id): ?Client;

    public function create(array $data): Client;

    public function update(int $id, array $data): ?Client;

    public function delete(int $id): bool;
}
