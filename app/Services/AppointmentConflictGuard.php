<?php

namespace App\Services;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * LA règle anti-double-réservation, sortie du contrôleur pour être partagée.
 *
 * Deux canaux créent des réservations — l'agenda staff/partenaire
 * (AppointmentController) et l'application mobile publique
 * (PublicBookingService) — et un seul arbitre décide si un employé est libre.
 * Dupliquer ce calcul, c'est garantir qu'un jour les deux canaux divergent et
 * qu'un client public réserve un employé déjà pris par l'agenda.
 *
 * La règle, inchangée depuis le contrôleur : un employé est en conflit si un
 * rendez-vous non annulé (`cancelled`, `no_show`, `refused` exclus) chevauche
 * l'intervalle et le mentionne — que ce soit par sa colonne `employee_id` ou
 * dans ses `reservation_items`. Les lignes sans employé ne bloquent rien.
 */
class AppointmentConflictGuard
{
    /**
     * Les employés indisponibles sur un intervalle, avec leurs créneaux.
     *
     * @return Collection<int, Collection<int, array{starts_at: Carbon, ends_at: Carbon}>>
     *         employee_id => liste d'intervalles occupés
     */
    public function busyIntervals(Carbon $from, Carbon $to, ?Appointment $ignore = null): Collection
    {
        $busy = [];

        $existing = Appointment::query()
            ->when($ignore, fn ($query) => $query->where('id', '!=', $ignore->id))
            ->whereNotIn('status', ['cancelled', 'no_show', 'refused'])
            ->where('starts_at', '<', $to)
            ->where('ends_at', '>', $from)
            ->get(['id', 'employee_id', 'reservation_items', 'starts_at', 'ends_at']);

        foreach ($existing as $candidate) {
            $employeeIds = collect($candidate->reservation_items ?: [[
                'employee_id' => $candidate->employee_id,
            ]])->pluck('employee_id')->filter()->map(fn ($id) => (int) $id)->unique();

            foreach ($employeeIds as $employeeId) {
                $busy[$employeeId][] = [
                    'starts_at' => $candidate->starts_at,
                    'ends_at' => $candidate->ends_at,
                ];
            }
        }

        return collect($busy)->map(fn (array $intervals) => collect($intervals));
    }

    /**
     * Un employé donné est-il libre sur [$from, $to[ ?
     *
     * @param  Collection<int, Collection<int, array{starts_at: Carbon, ends_at: Carbon}>>  $busy
     *         Sortie de {@see busyIntervals()} pour une plage englobante.
     */
    public function isFree(Collection $busy, int $employeeId, Carbon $from, Carbon $to): bool
    {
        $intervals = $busy->get($employeeId);
        if ($intervals === null) {
            return true;
        }

        return $intervals->every(
            fn (array $interval) => $interval['ends_at'] <= $from || $interval['starts_at'] >= $to,
        );
    }

    /**
     * Refuse (422) si un employé des lignes fournies est déjà réservé.
     *
     * Comportement historique du contrôleur d'agenda, à l'identique.
     *
     * @param  array<int, array{employee_id: ?int}>  $items
     */
    public function assertNoConflict(array $items, Carbon $startsAt, Carbon $endsAt, ?Appointment $ignore = null): void
    {
        $employeeIds = collect($items)->pluck('employee_id')->filter()->unique()->values();
        if ($employeeIds->isEmpty()) {
            return;
        }

        $existing = Appointment::query()
            ->when($ignore, fn ($query) => $query->where('id', '!=', $ignore->id))
            ->whereNotIn('status', ['cancelled', 'no_show', 'refused'])
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
