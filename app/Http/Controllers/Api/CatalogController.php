<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    public function employees(): JsonResponse
    {
        $employees = Employee::where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Employee $employee) => [
                'id' => $employee->id,
                'name' => $employee->name,
                'role' => $employee->role,
                'avatar_color' => $employee->avatar_color,
                'is_active' => (bool) $employee->is_active,
                'default_commission_rate' => $employee->default_commission_rate !== null
                    ? (float) $employee->default_commission_rate
                    : null,
            ]);

        return response()->json(['data' => $employees]);
    }

    public function clients(Request $request): JsonResponse
    {
        $query = Client::query();

        if ($search = $request->query('search')) {
            $query->where('name', 'like', '%'.$search.'%');
            $query->limit(20);
        } else {
            $query->latest('created_at')->limit(20);
        }

        $clients = $query->get()->map(fn (Client $client) => [
            'id' => $client->id,
            'name' => $client->name,
            'phone' => $client->phone,
            'loyalty_points' => $client->loyalty_points,
        ]);

        return response()->json(['data' => $clients]);
    }

    public function storeClient(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $client = Client::create($data);

        return response()->json([
            'data' => [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
                'loyalty_points' => $client->loyalty_points,
            ],
        ], 201);
    }

    public function services(Request $request): JsonResponse
    {
        $query = Service::where('is_active', true);

        if ($category = $request->query('category')) {
            $query->where('category', $category);
        }

        $services = $query->orderBy('name')->get()->map(fn (Service $service) => [
            'id' => $service->id,
            'name' => $service->name,
            'category' => $service->category,
            'price' => (float) $service->price,
            'duration_minutes' => $service->duration_minutes,
        ]);

        return response()->json(['data' => $services]);
    }
}
