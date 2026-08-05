<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceRequest;
use App\Http\Requests\UpdateServiceRequest;
use App\Http\Resources\ServiceResource;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ServiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['nullable', 'string', Rule::in(['coiffure', 'hammam', 'massage', 'boisson', 'vitrine', 'autre'])],
            'include_inactive' => ['sometimes', 'boolean'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Service::query();

        if (! ($validated['include_inactive'] ?? false)) {
            $query->where('is_active', true);
        }

        if (! empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where('name', 'like', '%'.$search.'%');
        }

        $services = $query->orderBy('category')->orderBy('name')->get();

        // Personalised to the requesting employee's own most-performed
        // services first — an admin/caissier (no linked employee) keeps the
        // plain alphabetical order above, and a service this employee has
        // never used yet simply falls back to that same order.
        $employee = $request->user()?->employee;
        if ($employee && $services->isNotEmpty()) {
            $usageCounts = DB::table('prestation_items')
                ->join('prestations', 'prestations.id', '=', 'prestation_items.prestation_id')
                ->where('prestations.employee_id', $employee->id)
                ->whereIn('prestation_items.service_id', $services->pluck('id'))
                ->select('prestation_items.service_id', DB::raw('COUNT(*) as usage_count'))
                ->groupBy('prestation_items.service_id')
                ->pluck('usage_count', 'service_id');

            $services = $services->sortByDesc(
                fn (Service $service) => $usageCounts[$service->id] ?? 0,
            )->values();
        }

        return response()->json(['data' => ServiceResource::collection($services)]);
    }

    public function store(StoreServiceRequest $request): JsonResponse
    {
        $service = Service::create($this->normalize($request->validated(), true));

        return response()->json(['data' => new ServiceResource($service)], 201);
    }

    public function show(Service $service): JsonResponse
    {
        return response()->json(['data' => new ServiceResource($service)]);
    }

    public function update(UpdateServiceRequest $request, Service $service): JsonResponse
    {
        $service->update($this->normalize($request->validated()));

        return response()->json(['data' => new ServiceResource($service->refresh())]);
    }

    public function destroy(Service $service): JsonResponse
    {
        $service->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $creating = false): array
    {
        if (($creating && ! array_key_exists('color', $data)) || (array_key_exists('color', $data) && $data['color'] === null)) {
            $data['color'] = '#C8A24C';
        }

        if ($creating && ! array_key_exists('is_active', $data)) {
            $data['is_active'] = true;
        }

        return $data;
    }
}
