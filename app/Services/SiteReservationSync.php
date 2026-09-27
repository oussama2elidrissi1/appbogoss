<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Client;
use App\Models\Service;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Réservations du site bogosland.com (plugin WordPress bogosland-reservation)
 * ↔ agenda de l'application. Lancé toutes les 5 minutes par la commande
 * `site-reservations:sync` (cron du serveur).
 *
 * Import — chaque réservation à venir, en attente ou confirmée, devient un
 * rendez-vous : source « site », même statut, SANS employé (l'équipe
 * l'attribue dans l'agenda). `external_ref` = « wp:{id} » rend l'import
 * idempotent. Le client est retrouvé par téléphone, sinon créé.
 *
 * Statuts, dans les deux sens — `external_status` retient le dernier statut
 * du site déjà synchronisé :
 *  - s'il a changé côté site (confirmée, terminée ou annulée dans l'admin
 *    WordPress ou depuis la page « Réservations site web »), le rendez-vous
 *    suit — en cas de changement des deux côtés entre deux passages, le site
 *    l'emporte ;
 *  - sinon, un changement fait dans l'agenda est reporté sur le site.
 * Une réservation supprimée du site laisse son rendez-vous intact.
 */
class SiteReservationSync
{
    /** Au-delà, un rendez-vous passé n'est plus synchronisé. */
    private const SYNC_WINDOW_DAYS = 60;

    public function __construct(
        private readonly PublicBookingService $booking,
        private readonly AppointmentNotifier $notifier,
    ) {}

    public function configured(): bool
    {
        return (bool) config('database.connections.wordpress.database');
    }

    /** @return array{imported: int, to_agenda: int, to_site: int, skipped: list<string>} */
    public function run(): array
    {
        $wp = DB::connection('wordpress');
        $summary = ['imported' => 0, 'to_agenda' => 0, 'to_site' => 0, 'skipped' => []];

        $this->importNew($wp, $summary);
        $this->syncStatuses($wp, $summary);

        return $summary;
    }

    /** L'heure de WordPress (Réglages → Général), comme current_time('mysql') du plugin. */
    public function wordpressTimestamp(ConnectionInterface $wp): string
    {
        $timezone = $wp->table('options')->where('option_name', 'timezone_string')->value('option_value');

        return now($timezone ?: config('app.timezone'))->format('Y-m-d H:i:s');
    }

    /** Statut du site correspondant à un statut d'agenda (le site n'a pas no_show / refused). */
    public static function siteStatusOf(string $agendaStatus): string
    {
        return match ($agendaStatus) {
            'pending', 'confirmed', 'completed' => $agendaStatus,
            default => 'cancelled',
        };
    }

    public static function ref(int $wpId): string
    {
        return 'wp:'.$wpId;
    }

    // ─── Import ──────────────────────────────────────────────────────────

    private function importNew(ConnectionInterface $wp, array &$summary): void
    {
        $rows = $wp->table('bgl_appointments')
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('appointment_date', '>=', $this->booking->wallClockNow()->toDateString())
            ->orderBy('id')
            ->get();
        if ($rows->isEmpty()) {
            return;
        }

        $known = Appointment::query()
            ->whereIn('external_ref', $rows->map(fn ($row) => self::ref((int) $row->id)))
            ->pluck('external_ref')
            ->flip();
        $rows = $rows->reject(fn ($row) => isset($known[self::ref((int) $row->id)]));
        if ($rows->isEmpty()) {
            return;
        }

        $wpServices = $wp->table('bgl_services')->pluck('name', 'id');
        $packServices = $wp->table('bgl_pack_services')->orderBy('sort_order')->get()->groupBy('pack_id');
        $catalog = Service::query()->where('is_active', true)->get();

        foreach ($rows as $row) {
            try {
                $services = $this->servicesFor($row, $wpServices, $packServices, $catalog);
                if ($services === null) {
                    // Retentée à chaque passage, signalée une fois par jour.
                    if (Cache::add('site-reservations:unmapped:'.$row->id, true, now()->addDay())) {
                        $summary['skipped'][] = "#{$row->id} : service du site sans équivalent actif dans l'application";
                    }

                    continue;
                }

                $appointment = $this->createAppointment($row, $services);
                $this->notifier->siteBookingCreated($appointment);
                $summary['imported']++;
            } catch (UniqueConstraintViolationException) {
                continue; // importée entre-temps par un autre passage
            } catch (Throwable $exception) {
                report($exception);
                $summary['skipped'][] = "#{$row->id} : ".$exception->getMessage();
            }
        }
    }

    /**
     * Services de l'application pour une réservation du site (un pack en donne
     * plusieurs), ou null si l'un d'eux n'a pas d'équivalent.
     *
     * @return list<Service>|null
     */
    private function servicesFor(object $row, Collection $wpServices, Collection $packServices, Collection $catalog): ?array
    {
        $wpIds = $row->pack_id
            ? ($packServices[$row->pack_id] ?? collect())->pluck('service_id')->all()
            : [$row->service_id];

        $services = [];
        foreach ($wpIds as $wpId) {
            $name = $wpServices[$wpId] ?? null;
            $service = $name !== null ? $this->matchService($name, $catalog) : null;
            if ($service === null) {
                return null;
            }
            $services[] = $service;
        }

        return $services ?: null;
    }

    /**
     * Même prestation, nommée un peu différemment d'un catalogue à l'autre :
     * « Barbe Tracée » = « Barbe tracée », « Kératine » = « Kératine (à partir
     * de) », « Soin Visage Express » = « Soin visage express 15 min ». Nom
     * identique d'abord ; sinon le plus court qui commence par ce nom.
     */
    private function matchService(string $wpName, Collection $catalog): ?Service
    {
        $normalize = fn (string $name) => trim(preg_replace('/[^a-z0-9]+/', ' ', Str::lower(Str::ascii($name))));
        $wanted = $normalize($wpName);
        if ($wanted === '') {
            return null;
        }

        return $catalog->first(fn (Service $service) => $normalize($service->name) === $wanted)
            ?? $catalog
                ->filter(fn (Service $service) => str_starts_with($normalize($service->name), $wanted.' '))
                ->sortBy(fn (Service $service) => mb_strlen($service->name))
                ->first();
    }

    /** @param  list<Service>  $services */
    private function createAppointment(object $row, array $services): Appointment
    {
        // Date et heure murales du salon, comme tous les canaux de l'agenda.
        $startsAt = Carbon::parse($row->appointment_date.' '.substr((string) $row->appointment_time, 0, 5));
        $duration = max(5, (int) $row->duration_min);
        $prices = $this->splitPrice((float) $row->price, $services);

        $items = [];
        foreach ($services as $index => $service) {
            $items[] = [
                'uid' => (string) Str::random(12),
                'service_id' => $service->id,
                'employee_id' => null,
                'person_index' => 0,
                'price_snapshot' => $prices[$index],
                'commission_snapshot' => null,
                'duration_minutes_snapshot' => (int) $service->duration_minutes,
            ];
        }
        $catalogDuration = array_sum(array_column($items, 'duration_minutes_snapshot'));
        $status = $row->status === 'confirmed' ? 'confirmed' : 'pending';

        return DB::transaction(function () use ($row, $items, $startsAt, $duration, $catalogDuration, $status) {
            $client = $this->findOrCreateClient($row);

            $appointment = Appointment::create([
                'client_id' => $client->id,
                'client_ids' => [$client->id],
                'employee_id' => null,
                'service_id' => $items[0]['service_id'],
                'starts_at' => $startsAt,
                'ends_at' => $startsAt->copy()->addMinutes($duration),
                // Le créneau promis sur le site fait foi s'il diffère du catalogue.
                'duration_override_minutes' => $duration !== $catalogDuration ? $duration : null,
                'status' => $status,
                'source' => Appointment::SOURCE_SITE,
                'external_ref' => self::ref((int) $row->id),
                'external_status' => $row->status,
                'notes' => trim("Réservation #{$row->id} du site bogosland.com\n".($row->notes ?? '')),
                'reservation_items' => $items,
                'people' => [['name' => $client->name]],
                'created_by_user_id' => null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'from_status' => null,
                'to_status' => $status,
                'user_id' => null,
                'reason' => 'Réservation du site bogosland.com',
            ]);

            return $appointment->load(['client', 'service']);
        });
    }

    /**
     * Le prix payé sur le site, réparti entre les prestations au prorata du
     * catalogue (un pack coûte moins cher que ses prestations séparées).
     *
     * @param  list<Service>  $services
     * @return list<float>
     */
    private function splitPrice(float $total, array $services): array
    {
        if (count($services) === 1) {
            return [round($total, 2)];
        }

        $weights = array_map(fn (Service $service) => max(0.0, (float) $service->price), $services);
        $sum = array_sum($weights) ?: count($services);
        $prices = [];
        $allocated = 0.0;
        foreach ($services as $index => $service) {
            $last = $index === count($services) - 1;
            $share = $last ? $total - $allocated : round($total * (($weights[$index] ?: 1) / $sum), 2);
            $prices[] = round($share, 2);
            $allocated += $share;
        }

        return $prices;
    }

    /**
     * Même règle que le canal public : téléphone normalisé d'abord, client
     * existant jamais réécrit. En plus, les clients saisis par l'équipe n'ont
     * pas de phone_e164 : on compare aussi les chiffres du numéro.
     */
    private function findOrCreateClient(object $row): Client
    {
        $phone = trim((string) $row->client_phone);
        $e164 = PhoneNumberNormalizer::toE164($phone);

        if ($e164 !== null) {
            $client = Client::query()->where('phone_e164', $e164)->first();
            if ($client !== null) {
                return $client;
            }
        }

        $digits = PhoneNumberNormalizer::searchDigits($phone);
        if ($digits !== null && strlen($digits) >= 9) {
            $client = Client::query()
                ->whereRaw("REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') LIKE ?", ['%'.substr($digits, -9)])
                ->get()
                ->first(fn (Client $candidate) => PhoneNumberNormalizer::searchDigits((string) $candidate->phone) === $digits);
            if ($client !== null) {
                return $client;
            }
        }

        return Client::query()->create([
            'name' => trim((string) $row->client_name) ?: 'Client du site',
            'phone' => $phone,
            'phone_e164' => $e164,
            'email' => filled($row->client_email ?? null) ? trim((string) $row->client_email) : null,
            'avatar_color' => collect(['#4C7CC8', '#C8A24C', '#2E7D5B', '#8C6BC8', '#C84C6B', '#6B8CC8'])->random(),
        ]);
    }

    // ─── Statuts ─────────────────────────────────────────────────────────

    private function syncStatuses(ConnectionInterface $wp, array &$summary): void
    {
        $appointments = Appointment::query()
            ->where('source', Appointment::SOURCE_SITE)
            ->whereNotNull('external_ref')
            ->where('starts_at', '>=', $this->booking->wallClockNow()->subDays(self::SYNC_WINDOW_DAYS))
            ->get();
        if ($appointments->isEmpty()) {
            return;
        }

        $wpIds = $appointments->map(fn (Appointment $appointment) => self::wpId($appointment->external_ref))->filter();
        $siteStatuses = $wp->table('bgl_appointments')->whereIn('id', $wpIds)->pluck('status', 'id');

        foreach ($appointments as $appointment) {
            $wpId = self::wpId($appointment->external_ref);
            $siteStatus = $siteStatuses[$wpId] ?? null;
            if ($siteStatus === null) {
                continue; // supprimée du site : on ne touche pas au rendez-vous
            }

            try {
                if ($siteStatus !== $appointment->external_status) {
                    $this->applySiteStatus($appointment, $siteStatus);
                    $summary['to_agenda']++;
                } elseif (($agendaStatus = self::siteStatusOf($appointment->status)) !== $siteStatus) {
                    // Conditionnel : si le site a bougé depuis la lecture, le
                    // prochain passage le verra et le site l'emportera.
                    $updated = $wp->table('bgl_appointments')
                        ->where('id', $wpId)
                        ->where('status', $siteStatus)
                        ->update(['status' => $agendaStatus, 'updated_at' => $this->wordpressTimestamp($wp)]);
                    if ($updated) {
                        $appointment->forceFill(['external_status' => $agendaStatus])->save();
                        $summary['to_site']++;
                    }
                }
            } catch (Throwable $exception) {
                report($exception);
                $summary['skipped'][] = "#{$wpId} : ".$exception->getMessage();
            }
        }
    }

    private function applySiteStatus(Appointment $appointment, string $siteStatus): void
    {
        $from = $appointment->status;

        // Déjà équivalents (ex. « absent » dans l'agenda, « annulée » sur le site).
        if (self::siteStatusOf($from) === $siteStatus) {
            $appointment->forceFill(['external_status' => $siteStatus])->save();

            return;
        }

        DB::transaction(function () use ($appointment, $from, $siteStatus) {
            $appointment->forceFill(array_merge(
                ['status' => $siteStatus, 'external_status' => $siteStatus],
                $siteStatus === 'cancelled'
                    ? ['cancelled_at' => now(), 'cancellation_reason' => 'Annulée sur le site bogosland.com']
                    : [],
            ))->save();

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'from_status' => $from,
                'to_status' => $siteStatus,
                'user_id' => null,
                'reason' => 'Modifié sur le site bogosland.com',
            ]);
        });
    }

    private static function wpId(?string $ref): ?int
    {
        return $ref !== null && str_starts_with($ref, 'wp:') ? (int) substr($ref, 3) : null;
    }
}
