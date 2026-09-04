<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePublicReservationRequest;
use App\Models\AppSetting;
use App\Models\Service;
use App\Services\PublicBookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * La vitrine publique — AUCUNE authentification, AUCUNE donnée interne.
 *
 * Tout ce qui sort d'ici est ce qu'un passant lirait sur la devanture du
 * salon : les prestations actives (nom, prix, durée), les prénoms des
 * employés réservables, les horaires. Jamais de salaire, de commission, de
 * portefeuille, d'email d'employé, de permission ni d'identifiant interne
 * au-delà des ids nécessaires à la réservation.
 */
class PublicBookingController extends Controller
{
    public function __construct(private readonly PublicBookingService $booking) {}

    /** GET /api/public/salon — l'identité du salon pour l'écran d'accueil. */
    public function salon(): JsonResponse
    {
        $settings = array_merge(
            [
                'salon_name' => 'BOGOSLAND',
                'salon_phone' => '',
                'salon_email' => '',
                'salon_address' => '',
                'currency' => 'MAD',
                'logo_url' => null,
            ],
            AppSetting::query()
                ->whereIn('key', ['salon_name', 'salon_phone', 'salon_email', 'salon_address', 'currency', 'logo_url'])
                ->pluck('value', 'key')
                ->all(),
        );
        $booking = $this->booking->bookingSettings();

        return response()->json(['data' => [
            'name' => $settings['salon_name'],
            'phone' => $settings['salon_phone'],
            'email' => $settings['salon_email'],
            'address' => $settings['salon_address'],
            'currency' => $settings['currency'],
            'logo_url' => $settings['logo_url'],
            'opening_hours' => [
                'open' => $booking['booking_open_time'],
                'close' => $booking['booking_close_time'],
            ],
            'booking' => [
                'slot_minutes' => (int) $booking['booking_slot_minutes'],
                'lead_minutes' => (int) $booking['booking_lead_minutes'],
                'horizon_days' => (int) $booking['booking_horizon_days'],
            ],
        ]]);
    }

    /** GET /api/public/services — le catalogue actif, avec ses catégories. */
    public function services(): JsonResponse
    {
        $services = Service::query()
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => [
            'categories' => $services->pluck('category')->filter()->unique()->values()->all(),
            'services' => $services->map(fn (Service $service) => $this->publicService($service))->all(),
        ]]);
    }

    /** GET /api/public/service-categories */
    public function categories(): JsonResponse
    {
        $categories = Service::query()
            ->where('is_active', true)
            ->select('category')
            ->selectRaw('count(*) as services_count')
            ->groupBy('category')
            ->orderBy('category')
            ->get()
            ->map(fn ($row) => ['name' => $row->category, 'services_count' => (int) $row->services_count])
            ->values();

        return response()->json(['data' => $categories]);
    }

    /** GET /api/public/services/{service} */
    public function service(Service $service): JsonResponse
    {
        abort_unless($service->is_active, 404);

        return response()->json(['data' => array_merge(
            $this->publicService($service),
            [
                'employees' => $this->booking->bookableEmployeesFor($service)->map(fn ($employee) => [
                    'id' => $employee->id,
                    'name' => $employee->name,
                    'role' => $employee->role,
                    'avatar_color' => $employee->avatar_color,
                ])->all(),
            ],
        )]);
    }

    /** GET /api/public/availability?service_id&date&employee_id */
    public function availability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer', Rule::exists('services', 'id')->where('is_active', true)],
            'date' => ['required', 'date_format:Y-m-d'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
        ]);

        $service = Service::query()->findOrFail($validated['service_id']);

        return response()->json(['data' => $this->booking->availability(
            $service,
            $validated['date'],
            isset($validated['employee_id']) ? (int) $validated['employee_id'] : null,
        )]);
    }

    /** POST /api/public/reservations — la prise de rendez-vous. */
    public function store(StorePublicReservationRequest $request): JsonResponse
    {
        $appointment = $this->booking->book($request->validated());

        return response()->json(['data' => [
            'id' => $appointment->id,
            'reference' => sprintf('RSV-%d', $appointment->id),
            'status' => $appointment->status,
            'starts_at' => $appointment->starts_at?->format('Y-m-d H:i'),
            'ends_at' => $appointment->ends_at?->format('Y-m-d H:i'),
            'service' => [
                'id' => $appointment->service?->id,
                'name' => $appointment->service?->name,
                'duration_minutes' => $appointment->service?->duration_minutes,
                'price' => $appointment->service !== null ? (float) $appointment->service->price : null,
            ],
            'employee' => $appointment->employee ? [
                'id' => $appointment->employee->id,
                'name' => $appointment->employee->name,
                'avatar_color' => $appointment->employee->avatar_color,
            ] : null,
            'client' => [
                'name' => $appointment->client?->name,
                'phone' => $appointment->client?->phone,
            ],
        ]], 201);
    }

    /** @return array<string, mixed> */
    private function publicService(Service $service): array
    {
        return [
            'id' => $service->id,
            'name' => $service->name,
            'category' => $service->category,
            'duration_minutes' => (int) $service->duration_minutes,
            'price' => (float) $service->price,
            'color' => $service->color,
            'requires_employee' => (bool) $service->requires_employee,
        ];
    }
}
