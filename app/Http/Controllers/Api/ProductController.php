<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:80'],
            'stock_area' => ['nullable', 'string', 'in:vitrine,refrigerateur'],
        ]);

        $query = Product::query()->orderBy('name');

        if (! empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (! empty($validated['stock_area'])) {
            $query->where('stock_area', $validated['stock_area']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($subQuery) use ($search): void {
                $subQuery
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('sku', 'like', '%'.$search.'%')
                    ->orWhere('category', 'like', '%'.$search.'%');
            });
        }

        return response()->json(['data' => ProductResource::collection($query->get())]);
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = Product::create($this->normalize($request->validated(), true));

        return response()->json(['data' => new ProductResource($product)], 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(['data' => new ProductResource($product)]);
    }

    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        $product->update($this->normalize($request->validated()));

        return response()->json(['data' => new ProductResource($product->refresh())]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $creating = false): array
    {
        if ($creating && empty($data['stock_area'])) {
            $data['stock_area'] = 'vitrine';
        }

        if (($creating && empty($data['sku'])) || (array_key_exists('sku', $data) && blank($data['sku']))) {
            $base = Str::upper(Str::slug($data['name'] ?? 'PRODUIT', '-'));
            $data['sku'] = Str::limit($base, 30, '').'-'.now()->format('His');
        }

        if (array_key_exists('cost', $data) && $data['cost'] === null) {
            $data['cost'] = 0;
        }

        return $data;
    }
}
