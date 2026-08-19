<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
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
            'partner_id' => ['nullable', 'integer', Rule::exists('partners', 'id')],
            'status' => ['nullable', 'string'],
        ]);

        $query = Appointment::with(['client', 'employee', 'service', 'partner'])
            ->orderBy('starts_at');

        if ($partner = $this->restrictedPartner($request, requireActive: false)) {
            $query->where('partner_id', $partner->id);
        } elseif (! empty($validated['partner_id'])) {
            $query->where('partner_id', $validated['partner_id']);
        }

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
        $data = $request->validated();

        if ($partner = $this->restrictedPartner($request)) {
            // Partner bookings are always attributed to the partner and land
            // as "pending" so the salon confirms them explicitly.
            $data['partner_id'] = $partner->id;
            $data['status'] = 'pending';
            $this->assertClientsBelongToPartner($data, $partner);
        }

        $appointment = Appointment::create($this->payloadWithEnd($data));
        $appointment->load(['client', 'employee', 'service', 'partner']);

        return response()->json(['data' => new AppointmentResource($appointment)], 201);
    }

    public function show(Request $request, Appointment $appointment): JsonResponse
    {
        $this->assertCanAccess($request, $appointment, requireActive: false);
        $appointment->load(['client', 'employee', 'service', 'partner']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function update(UpdateAppointmentRequest $request, Appointment $appointment): JsonResponse
    {
        $this->assertCanAccess($request, $appointment);
        $data = $request->validated();

        if ($partner = $this->restrictedPartner($request)) {
            // A partner may cancel their own reservation but never grant it a
            // salon-side status (confirmed/completed/no_show), nor reassign it.
            if (($data['status'] ?? null) !== 'cancelled') {
                unset($data['status']);
            }
            unset($data['partner_id']);
            $this->assertClientsBelongToPartner($data, $partner);
        }

        $appointment->update($this->payloadWithEnd($data, $appointment));
        $appointment->load(['client', 'employee', 'service', 'partner']);

        return response()->json(['data' => new AppointmentResource($appointment)]);
    }

    public function destroy(Request $request, Appointment $appointment): JsonResponse
    {
        $this->assertCanAccess($request, $appointment);
        $appointment->delete();

        return response()->json(status: 204);
    }

    /**
     * Partner-restricted context: the user reaches this controller through
     * `agenda.partner` only (no `agenda.manage`), so every operation must be
     * scoped to their own partner record. A suspended/pending partner can
     * still sign in and consult their own history — only creating or
     * mutating a reservation requires an active account.
     */
    private function restrictedPartner(Request $request, bool $requireActive = true): ?Partner
    {
        $user = $request->user();
        if (! $user || $user->can('agenda.manage')) {
            return null;
        }

        $partner = $user->partner;
        if (! $partner) {
            abort(403, 'Aucun compte partenaire n’est associé à cet utilisateur.');
        }
        if ($requireActive && ! $partner->is_active) {
            abort(403, 'Votre compte partenaire est suspendu ou inactif.');
        }

        return $partner;
    }

    private function assertCanAccess(Request $request, Appointment $appointment, bool $requireActive = true): void
    {
        $partner = $this->restrictedPartner($request, $requireActive);
        if ($partner && $appointment->partner_id !== $partner->id) {
            abort(403, 'Cette réservation n’appartient pas à votre compte partenaire.');
        }
    }

    /**
     * Prevents a partner from attributing a booking to a client they don't
     * own by supplying another partner's (or BOGOSLAND's own) client_id.
     */
    private function assertClientsBelongToPartner(array $data, Partner $partner): void
    {
        $ids = collect($data['client_ids'] ?? [])
            ->merge([$data['client_id'] ?? null])
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique();

        if ($ids->isEmpty()) {
            return;
        }

        if (Client::query()->whereIn('id', $ids)->where('partner_id', $partner->id)->count() !== $ids->count()) {
            abort(403, 'Un client sélectionné n’appartient pas à votre portefeuille.');
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function payloadWithEnd(array $data, ?Appointment $appointment = null): array
    {
        if (! array_key_exists('starts_at', $data)
            && ! array_key_exists('service_id', $data)
            && ! array_key_exists('employee_id', $data)
            && ! array_key_exists('items', $data)
            && ! array_key_exists('people', $data)
            && ! array_key_exists('duration_override_minutes', $data)) {
            return $data;
        }

        $items = $data['items'] ?? $appointment?->reservation_items;
        if (empty($items)) {
            $items = [[
                'service_id' => $data['service_id'] ?? $appointment?->service_id,
                'employee_id' => $data['employee_id'] ?? $appointment?->employee_id,
            ]];
        }

        // Participants: index 0 is the booking contact (the only person whose
        // coordinates are stored, through client_id). Extra people are just
        // names attached to the reservation.
        $people = array_key_exists('people', $data) ? $data['people'] : $appointment?->people;
        $people = collect(is_array($people) ? $people : [])
            ->map(fn ($person) => ['name' => filled($person['name'] ?? null) ? trim((string) $person['name']) : null])
            ->take(20)
            ->values();
        if ($people->isEmpty()) {
            $people = collect([['name' => null]]);
        }
        $personCount = $people->count();

        $items = collect($items)
            ->map(function (array $item) use ($personCount) {
                $personIndex = isset($item['person_index']) && $item['person_index'] !== '' && $item['person_index'] !== null
                    ? (int) $item['person_index']
                    : null;

                return [
                    'service_id' => (int) $item['service_id'],
                    'employee_id' => isset($item['employee_id']) && $item['employee_id'] !== '' && $item['employee_id'] !== null
                        ? (int) $item['employee_id']
                        : null,
                    'person_index' => $personIndex !== null && $personIndex >= 0 && $personIndex < $personCount
                        ? $personIndex
                        : 0,
                ];
            })
            ->values()
            ->all();

        $serviceIds = collect($items)->pluck('service_id')->unique()->values();
        $services = Service::query()->whereIn('id', $serviceIds)->get()->keyBy('id');
        if ($services->count() !== $serviceIds->count()) {
            abort(422, 'Une prestation sélectionnée n’existe plus.');
        }

        $employeeIds = collect($items)->pluck('employee_id')->filter()->unique()->values();
        if (Employee::query()->whereIn('id', $employeeIds)->count() !== $employeeIds->count()) {
            abort(422, 'Un employé sélectionné n’existe plus.');
        }

        $startsAt = Carbon::parse($data['starts_at'] ?? $appointment?->starts_at);
        $assigned = collect($items)->filter(fn (array $item) => $item['employee_id'] !== null);
        $unassigned = collect($items)->filter(fn (array $item) => $item['employee_id'] === null);
        $durationByEmployee = $assigned->groupBy('employee_id')->map(
            fn ($employeeItems) => $employeeItems->sum(fn (array $item) => (int) $services[$item['service_id']]->duration_minutes),
        );
        // Unassigned lines are worked per person in parallel: each participant's
        // own unassigned services run one after the other.
        $unassignedByPerson = $unassigned->groupBy('person_index')->map(
            fn ($personItems) => $personItems->sum(fn (array $item) => (int) $services[$item['service_id']]->duration_minutes),
        );
        $autoDuration = max((int) $durationByEmployee->max(), (int) $unassignedByPerson->max());

        $itemsProvided = array_key_exists('items', $data);
        $overrideProvided = array_key_exists('duration_override_minutes', $data);

        if ($overrideProvided && $data['duration_override_minutes'] !== null) {
            // Explicit resize from the calendar (drag the bottom edge) — trust it as-is.
            $duration = max(5, (int) $data['duration_override_minutes']);
            $durationOverride = $duration;
        } elseif (! $itemsProvided && ! $overrideProvided && $appointment?->duration_override_minutes) {
            // Move without touching services/duration — keep the previously resized length.
            $duration = (int) $appointment->duration_override_minutes;
            $durationOverride = $duration;
        } else {
            // Services changed (or first creation) — fall back to the catalog-derived duration.
            $duration = $autoDuration;
            $durationOverride = null;
        }

        $data['starts_at'] = $startsAt;
        $data['ends_at'] = $startsAt->copy()->addMinutes($duration);
        $data['service_id'] = $items[0]['service_id'];
        $data['employee_id'] = $assigned->first()['employee_id'] ?? null;
        $data['reservation_items'] = $items;
        $data['people'] = $people->all();
        $data['duration_override_minutes'] = $durationOverride;
        $clientIds = collect($data['client_ids'] ?? ($appointment?->client_ids ?: [$data['client_id'] ?? $appointment?->client_id]))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        if (array_key_exists('client_id', $data) && filled($data['client_id'])) {
            // The booking contact drives the reservation — make sure it is
            // always part of (and first in) the participant client list.
            $clientIds = collect([(int) $data['client_id']])
                ->merge($clientIds->reject(fn (int $id) => $id === (int) $data['client_id']))
                ->values();
        }
        if ($clientIds->isEmpty() || Client::query()->whereIn('id', $clientIds)->count() !== $clientIds->count()) {
            abort(422, 'Un client sélectionné n’existe plus.');
        }
        $data['client_ids'] = $clientIds->all();
        $data['client_id'] = $clientIds->first();
        unset($data['items']);
        $data['status'] = $data['status'] ?? $appointment?->status ?? 'confirmed';

        $this->assertNoConflict($items, $startsAt, $data['ends_at'], $appointment);

        return $data;
    }

    /** @param array<int, array{service_id: int, employee_id: ?int}> $items */
    private function assertNoConflict(array $items, Carbon $startsAt, Carbon $endsAt, ?Appointment $appointment = null): void
    {
        $employeeIds = collect($items)->pluck('employee_id')->filter()->unique()->values();
        if ($employeeIds->isEmpty()) {
            return;
        }

        $existing = Appointment::query()
            ->when($appointment, fn ($query) => $query->where('id', '!=', $appointment->id))
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt)
            ->get(['id', 'employee_id', 'reservation_items']);

        foreach ($existing as $candidate) {
            $candidateEmployees = collect($candidate->reservation_items ?: [[
                'employee_id' => $candidate->employee_id,
            ]])->pluck('employee_id')->filter()->map(fn ($id) => (int) $id);

            if ($candidateEmployees->intersect($employeeIds)->isNotEmpty()) {
                abort(422, 'Un employé est déjà réservé sur ce créneau.');
            }
        }
    }
}
