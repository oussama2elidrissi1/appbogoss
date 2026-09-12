<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\AppSetting;
use App\Models\Client;
use App\Models\Employee;
use App\Models\Partner;
use App\Models\PartnerOffering;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Le canal de réservation PUBLIC — vitrine et prise de rendez-vous des clients
 * depuis l'application mobile, sans compte.
 *
 * Ce service n'invente AUCUN système : il écrit des {@see Appointment} du même
 * format exact que l'agenda staff (reservation_items avec snapshots, people,
 * client_ids, journal de statut), arbitrés par la même
 * {@see AppointmentConflictGuard}, notifiés par le même
 * {@see AppointmentNotifier}. La seule différence est l'étiquette
 * `source = mobile_public` et le statut d'arrivée `pending` — le salon
 * confirme, comme pour les réservations partenaires.
 *
 * Convention horaire : tout le système travaille en HEURE MURALE du salon
 * (les datetimes de l'agenda sont saisis et stockés sans fuseau). Ce service
 * respecte la même convention ; « maintenant » est traduit dans le fuseau du
 * salon (booking_timezone) avant toute comparaison.
 */
class PublicBookingService
{
    /**
     * Défauts des réglages de réservation en ligne. Surchagés par AppSetting
     * (mêmes clés), modifiables via l'écran Réglages existant.
     */
    public const BOOKING_DEFAULTS = [
        'booking_open_time' => '09:00',
        'booking_close_time' => '00:00',
        'booking_slot_minutes' => '30',
        'booking_lead_minutes' => '60',
        'booking_horizon_days' => '30',
        'booking_timezone' => 'Africa/Casablanca',
    ];

    /** Garde anti-abus : réservations à venir non annulées par client. */
    private const MAX_UPCOMING_PER_CLIENT = 3;

    public function __construct(
        private readonly AppointmentConflictGuard $conflicts,
        private readonly AppointmentNotifier $notifier,
    ) {}

    /** @return array<string, string> */
    public function bookingSettings(): array
    {
        $stored = AppSetting::query()
            ->whereIn('key', array_keys(self::BOOKING_DEFAULTS))
            ->pluck('value', 'key')
            ->all();

        return array_merge(self::BOOKING_DEFAULTS, array_filter($stored, fn ($v) => $v !== null && $v !== ''));
    }

    /** L'heure qu'il est au salon, exprimée en heure murale naïve. */
    public function wallClockNow(): Carbon
    {
        $timezone = $this->bookingSettings()['booking_timezone'];

        return Carbon::parse(Carbon::now($timezone)->format('Y-m-d H:i:s'));
    }

    /**
     * La fenêtre d'ouverture d'un jour donné.
     *
     * Une heure de fermeture inférieure ou égale à l'ouverture est comprise
     * comme APRÈS MINUIT : « 09:00 → 00:00 » ferme à minuit pile (fin de
     * journée), « 09:00 → 01:00 » fermerait à une heure du matin. Sans cette
     * règle, régler la fermeture sur 00:00 rendrait chaque journée
     * entièrement fermée — minuit serait lu comme précédant l'ouverture.
     *
     * @return array{0: Carbon, 1: Carbon} [ouverture, fermeture]
     */
    private function openingWindowFor(string $date, array $settings): array
    {
        $open = Carbon::parse($date.' '.$settings['booking_open_time']);
        $close = Carbon::parse($date.' '.$settings['booking_close_time']);
        if ($close <= $open) {
            $close->addDay();
        }

        return [$open, $close];
    }

    /**
     * Les employés qu'un client peut réserver pour une prestation : actifs,
     * réels (ni fiche société ni fiche de démonstration), habilités.
     *
     * @return Collection<int, Employee>
     */
    public function bookableEmployeesFor(Service $service): Collection
    {
        return Employee::query()
            ->where('is_active', true)
            ->where('is_company', false)
            ->where('is_demo', false)
            ->orderBy('name')
            ->get()
            ->filter(fn (Employee $employee) => $employee->canPerform($service))
            ->values();
    }

    /**
     * Les créneaux d'une journée pour une prestation.
     *
     * @return array{
     *     date: string,
     *     open: bool,
     *     slots: list<array{starts_at: string, time: string, available: bool, employee_ids: list<int>}>,
     *     employees: list<array{id: int, name: string, role: ?string, avatar_color: ?string}>
     * }
     */
    public function availability(
        Service $service,
        string $date,
        ?int $employeeId = null,
        ?int $durationOverride = null,
    ): array {
        $settings = $this->bookingSettings();
        $day = Carbon::parse($date)->startOfDay();
        $now = $this->wallClockNow();

        $employees = $service->requires_employee ? $this->bookableEmployeesFor($service) : collect();
        if ($employeeId !== null) {
            $employees = $employees->where('id', $employeeId)->values();
            if ($service->requires_employee && $employees->isEmpty()) {
                throw ValidationException::withMessages([
                    'employee_id' => 'Cet employé ne réalise pas cette prestation.',
                ]);
            }
        }

        $horizonEnd = $now->copy()->addDays((int) $settings['booking_horizon_days'])->endOfDay();
        $withinHorizon = ! $day->isBefore($now->copy()->startOfDay()) && ! $day->isAfter($horizonEnd);

        [$open, $close] = $this->openingWindowFor($day->toDateString(), $settings);
        $step = max(5, (int) $settings['booking_slot_minutes']);
        $lead = $now->copy()->addMinutes((int) $settings['booking_lead_minutes']);
        // `durationOverride` sert aux PACKS : plusieurs prestations tiennent
        // un seul creneau, dont la duree est la somme des leurs. Nul ailleurs,
        // donc le canal public existant ne change pas d'un cheveu.
        $duration = max(5, $durationOverride ?? (int) $service->duration_minutes);

        $slots = [];
        if ($withinHorizon && $open < $close) {
            $busy = $this->conflicts->busyIntervals($open, $close->copy()->addMinutes($duration));

            for ($slot = $open->copy(); $slot->copy()->addMinutes($duration) <= $close; $slot->addMinutes($step)) {
                $slotEnd = $slot->copy()->addMinutes($duration);

                $freeIds = $service->requires_employee
                    ? $employees
                        ->filter(fn (Employee $employee) => $this->conflicts->isFree($busy, $employee->id, $slot, $slotEnd))
                        ->pluck('id')
                        ->values()
                        ->all()
                    : [];

                $available = $slot >= $lead
                    && (! $service->requires_employee || $freeIds !== []);

                $slots[] = [
                    'starts_at' => $slot->format('Y-m-d H:i'),
                    'time' => $slot->format('H:i'),
                    'available' => $available,
                    'employee_ids' => $available ? $freeIds : [],
                ];
            }
        }

        return [
            'date' => $day->toDateString(),
            'open' => $withinHorizon && $open < $close,
            'slots' => $slots,
            'employees' => $employees->map(fn (Employee $employee) => [
                'id' => $employee->id,
                'name' => $employee->name,
                'role' => $employee->role,
                'avatar_color' => $employee->avatar_color,
            ])->all(),
        ];
    }

    /**
     * Crée la réservation publique — une vraie réservation Bogosland.
     *
     * @param array{
     *     service_id: int, starts_at: string, employee_id?: ?int,
     *     name: string, phone: string, email?: ?string, note?: ?string
     * } $data
     */
    public function book(array $data): Appointment
    {
        $service = Service::query()->find($data['service_id']);
        if ($service === null || ! $service->is_active) {
            throw ValidationException::withMessages([
                'service_id' => 'Cette prestation n’est plus proposée.',
            ]);
        }

        $phoneE164 = PhoneNumberNormalizer::toE164($data['phone']);
        if ($phoneE164 === null) {
            throw ValidationException::withMessages([
                'phone' => 'Numéro de téléphone invalide. Utilisez un numéro marocain (ex. 06 12 34 56 78).',
            ]);
        }

        $startsAt = Carbon::parse($data['starts_at']);
        $duration = max(5, (int) $service->duration_minutes);
        $endsAt = $startsAt->copy()->addMinutes($duration);

        $this->assertSlotIsBookable($startsAt, $endsAt);

        return DB::transaction(function () use ($data, $service, $phoneE164, $startsAt, $endsAt, $duration) {
            $client = $this->findOrCreateClient($data, $phoneE164);
            $this->assertClientNotSaturated($client);

            $employeeId = $this->resolveEmployee($service, $data['employee_id'] ?? null, $startsAt, $endsAt);

            $items = [[
                'uid' => (string) Str::random(12),
                'service_id' => $service->id,
                'employee_id' => $employeeId,
                'person_index' => 0,
                'price_snapshot' => (float) $service->price,
                'commission_snapshot' => null,
                'duration_minutes_snapshot' => $duration,
            ]];

            // Même arbitre que l'agenda, dans la transaction : si deux clients
            // visent le même créneau au même instant, le second échoue ici.
            $this->conflicts->assertNoConflict($items, $startsAt, $endsAt);

            $appointment = Appointment::create([
                'client_id' => $client->id,
                'client_ids' => [$client->id],
                'employee_id' => $employeeId,
                'service_id' => $service->id,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'status' => 'pending',
                'source' => Appointment::SOURCE_MOBILE_PUBLIC,
                'notes' => filled($data['note'] ?? null) ? trim((string) $data['note']) : null,
                'reservation_items' => $items,
                'people' => [['name' => $client->name]],
                'created_by_user_id' => null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'from_status' => null,
                'to_status' => 'pending',
                'user_id' => null,
                'reason' => null,
            ]);

            $appointment->load(['client', 'employee', 'service']);
            $this->notifier->publicBookingCreated($appointment);

            return $appointment;
        });
    }

    /**
     * Les trois mêmes verrous de créneau pour tous les canaux publics : délai
     * minimum, horizon, salon ouvert. Extraits pour que la réservation venue
     * d'un QR partenaire ne puisse pas dériver de celle de l'application.
     */
    private function assertSlotIsBookable(Carbon $startsAt, Carbon $endsAt): void
    {
        $settings = $this->bookingSettings();
        $now = $this->wallClockNow();

        if ($startsAt < $now->copy()->addMinutes((int) $settings['booking_lead_minutes'])) {
            throw ValidationException::withMessages([
                'starts_at' => 'Ce créneau est trop proche ou déjà passé. Choisissez un horaire plus tard.',
            ]);
        }
        if ($startsAt > $now->copy()->addDays((int) $settings['booking_horizon_days'])->endOfDay()) {
            throw ValidationException::withMessages([
                'starts_at' => 'Ce créneau est trop lointain pour une réservation en ligne.',
            ]);
        }

        [$open, $close] = $this->openingWindowFor($startsAt->toDateString(), $settings);
        if ($startsAt < $open || $endsAt > $close) {
            throw ValidationException::withMessages([
                'starts_at' => 'Le salon est fermé sur ce créneau.',
            ]);
        }
    }

    /**
     * RÉSERVATION NÉE D'UN QR PARTENAIRE.
     *
     * Même écriture, mêmes tables, même arbitre de créneau que `book()` : la
     * réservation créée est une réservation Bogosland ordinaire. Trois seules
     * différences, et elles viennent toutes du SERVEUR :
     *
     *  - `partner_id` est celui du jeton résolu dans l'URL. Le formulaire
     *    public n'a aucun champ partenaire, et en aurait-il un qu'il ne serait
     *    pas lu : l'appelant passe un Partner déjà authentifié par son jeton ;
     *  - `source = partner_qr`, ce qui distingue le scan client du partenaire
     *    qui saisit lui-même depuis son portail (`source = partner`) ;
     *  - `partner_offering_id` garde l'offre vendue, seul moyen de retrouver
     *    la commission négociée d'un PACK au moment de l'encaissement.
     *
     * Le prix vient de l'offre côté serveur (`effectivePrice`), jamais du
     * navigateur : un prix falsifié dans la requête n'a nulle part où entrer.
     *
     * Propriété du client — la règle, et pourquoi :
     *
     *  - client inconnu : il est créé et rattaché au partenaire, qui l'a
     *    réellement amené (c'est ce qui alimente « clients apportés ») ;
     *  - client déjà rattaché à un autre partenaire : il NE CHANGE PAS de
     *    propriétaire. Seule la réservation est attribuée au scanneur. Voler
     *    un client par un scan casserait l'historique du premier partenaire ;
     *  - client déjà connu du salon sans partenaire : il reste sans
     *    propriétaire. Le salon le connaissait avant le partenaire, celui-ci
     *    ne l'a pas amené — mais la réservation lui est bien attribuée, donc
     *    il en touche la commission.
     */
    public function bookFromPartnerOffering(array $data, Partner $partner, PartnerOffering $offering): Appointment
    {
        $serviceIds = $offering->serviceIds();
        if ($serviceIds === []) {
            throw ValidationException::withMessages([
                'offering_id' => 'Cette offre n’est plus disponible.',
            ]);
        }

        $services = Service::query()->whereIn('id', $serviceIds)->get()->keyBy('id');
        foreach ($serviceIds as $serviceId) {
            if (! ($services[$serviceId] ?? null)?->is_active) {
                throw ValidationException::withMessages([
                    'offering_id' => 'Cette offre n’est plus disponible.',
                ]);
            }
        }

        $phoneE164 = PhoneNumberNormalizer::toE164($data['phone']);
        if ($phoneE164 === null) {
            throw ValidationException::withMessages([
                'phone' => 'Numéro de téléphone invalide. Utilisez un numéro marocain (ex. 06 12 34 56 78).',
            ]);
        }

        $startsAt = Carbon::parse($data['starts_at']);
        $duration = max(5, $offering->durationMinutes());
        $endsAt = $startsAt->copy()->addMinutes($duration);

        $this->assertSlotIsBookable($startsAt, $endsAt);

        return DB::transaction(function () use (
            $data, $partner, $offering, $serviceIds, $services, $phoneE164, $startsAt, $endsAt, $duration
        ) {
            $client = $this->findOrCreateClient($data, $phoneE164);
            $this->assertClientNotSaturated($client);

            // Le partenaire ne prend possession que d'un client qu'il amène
            // vraiment : jamais de celui d'un confrère, jamais d'un client que
            // le salon connaissait déjà.
            if ($client->wasRecentlyCreated && $client->partner_id === null) {
                $client->forceFill(['partner_id' => $partner->id])->save();
            }

            $prices = $this->spreadOfferingPrice($offering, $serviceIds, $services);
            $busyFor = $startsAt;

            $items = [];
            foreach ($serviceIds as $index => $serviceId) {
                /** @var Service $service */
                $service = $services[$serviceId];
                $items[] = [
                    'uid' => (string) Str::random(12),
                    'service_id' => $service->id,
                    // Un employé est cherché pour chaque prestation du pack,
                    // sur le créneau complet : la réservation vaut pour tout
                    // le passage, comme une réservation multi-services saisie
                    // par le salon.
                    'employee_id' => $this->resolveEmployee($service, null, $busyFor, $endsAt),
                    'person_index' => 0,
                    'price_snapshot' => $prices[$index],
                    'commission_snapshot' => null,
                    'duration_minutes_snapshot' => max(5, (int) $service->duration_minutes),
                ];
            }

            $this->conflicts->assertNoConflict($items, $startsAt, $endsAt);

            $appointment = Appointment::create([
                'client_id' => $client->id,
                'client_ids' => [$client->id],
                'partner_id' => $partner->id,
                'partner_offering_id' => $offering->id,
                'employee_id' => $items[0]['employee_id'],
                'service_id' => $items[0]['service_id'],
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'status' => 'pending',
                'source' => Appointment::SOURCE_PARTNER_QR,
                'notes' => filled($data['note'] ?? null) ? trim((string) $data['note']) : null,
                'reservation_items' => $items,
                'people' => [['name' => $client->name]],
                'created_by_user_id' => null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'from_status' => null,
                'to_status' => 'pending',
                'user_id' => null,
                'reason' => null,
            ]);

            $appointment->load(['client', 'employee', 'service']);
            $this->notifier->publicBookingCreated($appointment);

            return $appointment;
        });
    }

    /**
     * Répartit le prix de l'offre sur ses prestations, au prorata du tarif
     * catalogue, le reste sur la dernière — exactement la technique de
     * PosService::computeTotals(). Un pack à 250 DH dont les services valent
     * 300 doit rester un pack à 250 : la somme des `price_snapshot` ne peut
     * pas s'écarter du prix annoncé au client.
     *
     * @param  array<int, int>  $serviceIds
     * @return array<int, float>
     */
    private function spreadOfferingPrice(PartnerOffering $offering, array $serviceIds, Collection $services): array
    {
        $total = $offering->effectivePrice();
        $catalogue = array_map(
            fn (int $id) => round((float) ($services[$id]->price ?? 0), 2),
            $serviceIds,
        );
        $catalogueSum = round(array_sum($catalogue), 2);
        $last = count($serviceIds) - 1;

        $spread = [];
        $allocated = 0.0;
        foreach ($serviceIds as $index => $_) {
            if ($index === $last) {
                $spread[$index] = round($total - $allocated, 2);

                continue;
            }
            $share = $catalogueSum > 0
                ? round($total * $catalogue[$index] / $catalogueSum, 2)
                : round($total / max(1, count($serviceIds)), 2);
            $spread[$index] = $share;
            $allocated = round($allocated + $share, 2);
        }

        return $spread;
    }

    /**
     * Retrouve le client par téléphone normalisé — jamais de doublon — ou le
     * crée. Un client existant n'est PAS réécrit : son nom et son email font
     * foi, seule sa dernière intention de visite est mise à jour.
     */
    private function findOrCreateClient(array $data, string $phoneE164): Client
    {
        $existing = Client::query()->where('phone_e164', $phoneE164)->first();
        if ($existing !== null) {
            return $existing;
        }

        return Client::query()->create([
            'name' => trim($data['name']),
            'phone' => trim($data['phone']),
            'phone_e164' => $phoneE164,
            'email' => filled($data['email'] ?? null) ? trim((string) $data['email']) : null,
            'avatar_color' => collect(['#4C7CC8', '#C8A24C', '#2E7D5B', '#8C6BC8', '#C84C6B', '#6B8CC8'])->random(),
        ]);
    }

    private function assertClientNotSaturated(Client $client): void
    {
        $upcoming = Appointment::query()
            ->where('client_id', $client->id)
            // Les deux canaux publics comptent ensemble : sinon le QR
            // rouvrirait la porte que ce plafond ferme.
            ->whereIn('source', [Appointment::SOURCE_MOBILE_PUBLIC, Appointment::SOURCE_PARTNER_QR])
            ->whereNotIn('status', ['cancelled', 'no_show', 'refused', 'completed'])
            ->where('starts_at', '>=', $this->wallClockNow())
            ->count();

        if ($upcoming >= self::MAX_UPCOMING_PER_CLIENT) {
            throw ValidationException::withMessages([
                'phone' => 'Vous avez déjà plusieurs réservations à venir. Contactez le salon pour en ajouter une autre.',
            ]);
        }
    }

    /**
     * L'employé retenu : celui demandé s'il est habilité et libre, sinon le
     * premier habilité libre quand la prestation exige un employé.
     */
    private function resolveEmployee(Service $service, ?int $requestedId, Carbon $startsAt, Carbon $endsAt): ?int
    {
        if (! $service->requires_employee && $requestedId === null) {
            return null;
        }

        $eligible = $this->bookableEmployeesFor($service);
        $busy = $this->conflicts->busyIntervals($startsAt, $endsAt);

        if ($requestedId !== null) {
            $requested = $eligible->firstWhere('id', $requestedId);
            if ($requested === null) {
                throw ValidationException::withMessages([
                    'employee_id' => 'Cet employé ne réalise pas cette prestation.',
                ]);
            }
            if (! $this->conflicts->isFree($busy, $requested->id, $startsAt, $endsAt)) {
                throw ValidationException::withMessages([
                    'employee_id' => 'Cet employé n’est plus disponible sur ce créneau.',
                ]);
            }

            return $requested->id;
        }

        $free = $eligible->first(
            fn (Employee $employee) => $this->conflicts->isFree($busy, $employee->id, $startsAt, $endsAt),
        );
        if ($free === null) {
            throw ValidationException::withMessages([
                'starts_at' => 'Plus aucun employé n’est disponible sur ce créneau.',
            ]);
        }

        return $free->id;
    }
}
