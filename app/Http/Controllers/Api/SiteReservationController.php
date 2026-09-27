<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PDOException;

/**
 * Réservations faites sur le site vitrine bogosland.com (plugin WordPress
 * bogosland-reservation), affichées dans l'application.
 *
 * Les données restent dans la base WordPress (connexion `wordpress`) : rien
 * n'est copié, la liste est donc toujours à jour. Les seules écritures sont
 * les deux boutons de l'admin du plugin — Confirmer et Terminer — reproduits
 * à l'identique (voir updateStatus()).
 */
class SiteReservationController extends Controller
{
    private const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

    /** Statut visé => statut requis : on ne saute pas d'étape. */
    private const TRANSITIONS = ['confirmed' => 'pending', 'completed' => 'confirmed'];

    private const PER_PAGE = 25;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        if (! $this->configured()) {
            return $this->notConfigured();
        }

        try {
            $db = DB::connection('wordpress');
            $query = $this->reservations($db)
                ->orderByDesc('bgl_appointments.created_at')
                ->orderByDesc('bgl_appointments.id');

            if (! empty($validated['status'])) {
                $query->where('bgl_appointments.status', $validated['status']);
            }
            if (! empty($validated['search'])) {
                $like = '%'.addcslashes($validated['search'], '%_\\').'%';
                $query->where(function ($where) use ($like) {
                    $where->where('bgl_appointments.client_name', 'like', $like)
                        ->orWhere('bgl_appointments.client_phone', 'like', $like)
                        ->orWhere('bgl_appointments.client_email', 'like', $like);
                });
            }

            $page = $query->paginate(self::PER_PAGE);

            $counts = $db->table('bgl_appointments')
                ->select('status', DB::raw('count(*) as total'))
                ->groupBy('status')
                ->pluck('total', 'status');
        } catch (QueryException|PDOException $exception) {
            return $this->unavailable($exception);
        }

        return response()->json([
            'data' => collect($page->items())->map(fn ($row) => $this->present($row))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'counts' => [
                'all' => (int) $counts->sum(),
                ...collect(self::STATUSES)->mapWithKeys(fn ($status) => [$status => (int) ($counts[$status] ?? 0)])->all(),
            ],
        ]);
    }

    /**
     * Les boutons « Confirmer » et « Terminer » de l'admin du plugin
     * (BGL_Booking::ajax_update_status) : même écriture — statut + updated_at
     * à l'heure de WordPress —, aucun email ni autre effet côté plugin.
     */
    public function updateStatus(Request $request, int $id, ActivityLogger $activityLogger): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(array_keys(self::TRANSITIONS))],
        ]);
        $target = $validated['status'];

        if (! $this->configured()) {
            return $this->notConfigured();
        }

        try {
            $db = DB::connection('wordpress');
            $current = $db->table('bgl_appointments')->where('id', $id)->value('status');
            if ($current === null) {
                return response()->json(['message' => 'Réservation introuvable.'], 404);
            }

            // Conditionnel au statut attendu : deux clics simultanés ne
            // peuvent pas faire sauter une étape.
            $updated = $db->table('bgl_appointments')
                ->where('id', $id)
                ->where('status', self::TRANSITIONS[$target])
                ->update([
                    'status' => $target,
                    'updated_at' => now($this->wordpressTimezone($db))->format('Y-m-d H:i:s'),
                ]);
            if (! $updated) {
                return response()->json([
                    'message' => 'Cette réservation a changé de statut entre-temps. Actualisez la page.',
                ], 409);
            }

            $row = $this->reservations($db)->where('bgl_appointments.id', $id)->first();
        } catch (QueryException|PDOException $exception) {
            return $this->unavailable($exception);
        }

        $activityLogger->log('site_reservation.'.$target, null, ['status' => $current], [
            'site_reservation_id' => $id,
            'status' => $target,
        ]);

        return response()->json(['data' => $this->present($row)]);
    }

    private function configured(): bool
    {
        return (bool) config('database.connections.wordpress.database');
    }

    private function notConfigured(): JsonResponse
    {
        return response()->json([
            'message' => 'Les réservations du site ne sont pas configurées sur ce serveur.',
        ], 503);
    }

    private function unavailable(\Throwable $exception): JsonResponse
    {
        report($exception);

        return response()->json([
            'message' => 'Impossible de joindre les réservations du site pour le moment.',
        ], 503);
    }

    /** Réservations + nom du service ou du pack (noms de tables complets : le préfixe wp_ s'applique partout). */
    private function reservations(ConnectionInterface $db): Builder
    {
        return $db->table('bgl_appointments')
            ->leftJoin('bgl_services', function ($join) {
                $join->on('bgl_services.id', '=', 'bgl_appointments.service_id')
                    ->where('bgl_appointments.service_id', '>', 0);
            })
            ->leftJoin('bgl_packs', 'bgl_packs.id', '=', 'bgl_appointments.pack_id')
            ->select([
                'bgl_appointments.*',
                'bgl_services.name as service_name',
                'bgl_packs.name as pack_name',
            ]);
    }

    /** Fuseau configuré dans WordPress (Réglages → Général), comme current_time('mysql'). */
    private function wordpressTimezone(ConnectionInterface $db): string
    {
        $timezone = $db->table('options')->where('option_name', 'timezone_string')->value('option_value');

        return $timezone ?: config('app.timezone');
    }

    /** @return array<string, mixed> */
    private function present(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'client_name' => $row->client_name,
            'client_phone' => $row->client_phone,
            'client_email' => $row->client_email ?: null,
            'service' => $row->service_name ?? $row->pack_name,
            'is_pack' => $row->pack_id !== null,
            // Date et heure murales du salon, telles que saisies sur le site.
            'date' => $row->appointment_date,
            'time' => substr((string) $row->appointment_time, 0, 5),
            'duration_min' => (int) $row->duration_min,
            'price' => (float) $row->price,
            'status' => $row->status,
            'notes' => $row->notes ?: null,
            'created_at' => $row->created_at,
        ];
    }
}
