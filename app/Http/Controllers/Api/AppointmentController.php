<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AppointmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'status' => ['nullable', 'string'],
        ]);

        $query = Appointment::with(['client', 'employee', 'service'])
            ->orderBy('starts_at');

        if (! empty($validated['date'])) {
            $query->whereDate('starts_at', Carbon::parse($validated['date'])->toDateString());
        } else {
            $from = Carbon::parse($validated['date_from'] ?? now()->toDateString())->startOfDay();
            $to = Carbon::parse($validated['date_to'] ?? $from->toDateString())->endOfDay();
            $query->whereBetween('starts_at', [$from, $to]);
        }

        if (! empty($validated['employee_id'])) {
            $query->where('employee_id', $validated['employee_id']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return response()->json(['data' => AppointmentResource::collection($query->get())]);
    }

    public function store(StoreAppointmentRequest $request): JsonResponse
    {
        $appointment = Appointment::create($this->payloadWithEnd($request->validated()));
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)], 201);
    }

    public function show(Appointment $appointment): JsonResponse
    {
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function update(UpdateAppointmentRequest $request, Appointment $appointment): JsonResponse
    {
        $appointment->update($this->payloadWithEnd($request->validated(), $appointment));
        $appointment->load(['client', 'employee', 'service']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function destroy(Appointment $appointment): JsonResponse
    {
        $appointment->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function payloadWithEnd(array $data, ?Appointment $appointment = null): array
    {
        if (! array_key_exists('starts_at', $data) && ! array_key_exists('service_id', $data)) {
            return $data;
        }

        $serviceId = $data['service_id'] ?? $appointment?->service_id;
        $startsAt = Carbon::parse($data['starts_at'] ?? $appointment?->starts_at);
        $duration = Service::findOrFail($serviceId)->duration_minutes;

        $data['starts_at'] = $startsAt;
        $data['ends_at'] = $startsAt->copy()->addMinutes($duration);
        $data['status'] = $data['status'] ?? $appointment?->status ?? 'confirmed';

        return $data;
    }
}
