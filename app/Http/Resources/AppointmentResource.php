<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;

class AppointmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $items = collect($this->reservation_items ?: [[
            'service_id' => $this->service_id,
            'employee_id' => $this->employee_id,
        ]]);
        $serviceModels = Service::query()->whereIn('id', $items->pluck('service_id')->unique())->get()->keyBy('id');
        $employeeModels = Employee::query()->whereIn('id', $items->pluck('employee_id')->filter()->unique())->get()->keyBy('id');
        $clientIds = collect($this->client_ids ?: [$this->client_id])->filter()->unique()->values();
        $clientModels = Client::query()->whereIn('id', $clientIds)->get()->keyBy('id');

        $people = collect($this->people ?: [])->values();
        if ($people->isEmpty()) {
            // Legacy reservations: derive one participant per selected client.
            $people = $clientModels->count() > 0
                ? $clientModels->values()->map(fn (Client $client) => ['name' => $client->name])
                : collect([['name' => $this->client?->name]]);
        }

        $partner = $this->partner_id ? $this->partner : null;
        $partnerCommission = $partner
            ? round($items->sum(function (array $item) use ($partner, $serviceModels) {
                $service = $serviceModels->get($item['service_id']);

                return $service ? $partner->commissionFor($service->id, (float) $service->price) : 0.0;
            }), 2)
            : null;

        return [
            'id' => $this->id,
            'client_id' => $this->client_id,
            'client_ids' => $clientIds->all(),
            'partner_id' => $this->partner_id,
            'partner' => $partner ? [
                'id' => $partner->id,
                'name' => $partner->name,
            ] : null,
            'partner_commission' => $partnerCommission,
            'people' => $people->map(fn (array $person, int $index) => [
                'name' => $person['name'] ?? null,
                'is_contact' => $index === 0,
            ])->values()->all(),
            'clients' => $clientModels->values()->map(fn (Client $client) => [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
            ])->all(),
            'employee_id' => $this->employee_id,
            'service_id' => $this->service_id,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'status' => $this->status,
            'notes' => $this->notes,
            'duration_minutes' => $this->starts_at && $this->ends_at ? $this->starts_at->diffInMinutes($this->ends_at) : 0,
            'duration_override_minutes' => $this->duration_override_minutes,
            'reservation_items' => $items->map(fn (array $item) => [
                'service_id' => (int) $item['service_id'],
                'employee_id' => $item['employee_id'] !== null ? (int) $item['employee_id'] : null,
                'person_index' => isset($item['person_index']) ? (int) $item['person_index'] : 0,
                'service' => $serviceModels->get($item['service_id']) ? [
                    'id' => $serviceModels[$item['service_id']]->id,
                    'name' => $serviceModels[$item['service_id']]->name,
                    'duration_minutes' => $serviceModels[$item['service_id']]->duration_minutes,
                    'price' => (float) $serviceModels[$item['service_id']]->price,
                    'color' => $serviceModels[$item['service_id']]->color,
                ] : null,
                'employee' => $employeeModels->get($item['employee_id']) ? [
                    'id' => $employeeModels[$item['employee_id']]->id,
                    'name' => $employeeModels[$item['employee_id']]->name,
                    'avatar_color' => $employeeModels[$item['employee_id']]->avatar_color,
                ] : null,
            ])->values()->all(),
            'services' => $items->map(fn (array $item) => $serviceModels->get($item['service_id']))->filter()->unique('id')->values()->map(fn (Service $service) => [
                'id' => $service->id,
                'name' => $service->name,
                'category' => $service->category,
                'duration_minutes' => $service->duration_minutes,
                'price' => (float) $service->price,
                'color' => $service->color,
            ])->all(),
            'employees' => $items->map(fn (array $item) => $employeeModels->get($item['employee_id']))->filter()->unique('id')->values()->map(fn (Employee $employee) => [
                'id' => $employee->id,
                'name' => $employee->name,
                'avatar_color' => $employee->avatar_color,
            ])->all(),
            'client' => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
                'phone' => $this->client->phone,
            ] : null,
            'employee' => $this->employee ? [
                'id' => $this->employee->id,
                'name' => $this->employee->name,
                'avatar_color' => $this->employee->avatar_color,
            ] : null,
            'service' => $this->service ? [
                'id' => $this->service->id,
                'name' => $this->service->name,
                'category' => $this->service->category,
                'duration_minutes' => $this->service->duration_minutes,
                'price' => (float) $this->service->price,
                'color' => $this->service->color,
            ] : null,
        ];
    }
}
