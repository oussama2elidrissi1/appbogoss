<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PDOException;

/**
 * Réservations faites sur le site vitrine bogosland.com (plugin WordPress
 * bogosland-reservation), affichées dans l'application en lecture seule.
 *
 * Les données restent dans la base WordPress (connexion `wordpress`) : rien
 * n'est copié, la liste est donc toujours à jour. Confirmer ou terminer une
 * réservation se fait toujours dans l'admin WordPress.
 */
class SiteReservationController extends Controller
{
    private const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

    private const PER_PAGE = 25;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        if (! config('database.connections.wordpress.database')) {
            return response()->json([
                'message' => 'Les réservations du site ne sont pas configurées sur ce serveur.',
            ], 503);
        }

        try {
            $db = DB::connection('wordpress');

            $query = $db->table('bgl_appointments')
                ->leftJoin('bgl_services', function ($join) {
                    $join->on('bgl_services.id', '=', 'bgl_appointments.service_id')
                        ->where('bgl_appointments.service_id', '>', 0);
                })
                ->leftJoin('bgl_packs', 'bgl_packs.id', '=', 'bgl_appointments.pack_id')
                ->select([
                    'bgl_appointments.*',
                    'bgl_services.name as service_name',
                    'bgl_packs.name as pack_name',
                ])
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
            report($exception);

            return response()->json([
                'message' => 'Impossible de lire les réservations du site pour le moment.',
            ], 503);
        }

        return response()->json([
            'data' => collect($page->items())->map(fn ($row) => [
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
            ])->values(),
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
}
