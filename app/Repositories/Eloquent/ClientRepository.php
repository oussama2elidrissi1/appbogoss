<?php

namespace App\Repositories\Eloquent;

use App\Models\Client;
use App\Repositories\Contracts\ClientRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class ClientRepository implements ClientRepositoryInterface
{
    public function all(): Collection
    {
        return Client::all();
    }

    public function find(int $id): ?Client
    {
        return Client::find($id);
    }

    public function create(array $data): Client
    {
        return Client::create($data);
    }

    public function update(int $id, array $data): ?Client
    {
        $client = $this->find($id);

        if (! $client) {
            return null;
        }

        $client->update($data);

        return $client;
    }

    public function delete(int $id): bool
    {
        $client = $this->find($id);

        return $client ? (bool) $client->delete() : false;
    }
}
