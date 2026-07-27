<?php

namespace App\Repositories\Eloquent;

use App\Models\Product;
use App\Repositories\Contracts\ProductRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

class ProductRepository implements ProductRepositoryInterface
{
    public function all(): Collection
    {
        return Product::all();
    }

    public function find(int $id): ?Product
    {
        return Product::find($id);
    }

    public function create(array $data): Product
    {
        return Product::create($data);
    }

    public function update(int $id, array $data): ?Product
    {
        $product = $this->find($id);

        if (! $product) {
            return null;
        }

        $product->update($data);

        return $product;
    }

    public function delete(int $id): bool
    {
        $product = $this->find($id);

        return $product ? (bool) $product->delete() : false;
    }
}
