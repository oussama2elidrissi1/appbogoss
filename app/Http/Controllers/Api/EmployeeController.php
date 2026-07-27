<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEmployeeRequest;
use App\Http\Requests\UpdateEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'include_inactive' => ['sometimes', 'boolean'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Employee::query()->orderBy('name');

        if (! ($validated['include_inactive'] ?? false)) {
            $query->where('is_active', true);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($subQuery) use ($search): void {
                $subQuery
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('role', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%')
                    ->orWhere('phone', 'like', '%'.$search.'%');
            });
        }

        return response()->json(['data' => EmployeeResource::collection($query->get())]);
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $data = $this->normalize($request->validated(), true);

        $employee = Employee::create($data);

        return response()->json(['data' => new EmployeeResource($employee)], 201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return response()->json(['data' => new EmployeeResource($employee)]);
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $employee->update($this->normalize($request->validated()));

        return response()->json(['data' => new EmployeeResource($employee->refresh())]);
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $employee->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalize(array $data, bool $creating = false): array
    {
        if (array_key_exists('email', $data) && $data['email'] === '') {
            $data['email'] = null;
        }

        if (array_key_exists('phone', $data) && $data['phone'] === '') {
            $data['phone'] = null;
        }

        if (($creating && ! array_key_exists('avatar_color', $data)) || (array_key_exists('avatar_color', $data) && $data['avatar_color'] === null)) {
            $data['avatar_color'] = '#C8A24C';
        }

        if ($creating && ! array_key_exists('is_active', $data)) {
            $data['is_active'] = true;
        }

        if ($creating || array_key_exists('specialties', $data)) {
            $data['specialties'] = array_values(array_filter(
                $data['specialties'] ?? [],
                fn ($specialty) => filled($specialty),
            ));
        }

        return $data;
    }
}
