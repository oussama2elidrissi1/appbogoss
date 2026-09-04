<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\User;
use App\Notifications\AppointmentNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * §34 — notifications for the partner-booking review workflow. A channel
 * failure must never break the underlying action (booking created,
 * confirmed, refused…), so send() logs and swallows rather than throwing.
 */
class AppointmentNotifier
{
    public function partnerBookingCreated(Appointment $appointment): void
    {
        $this->notifyStaff(
            'partner_booking_created',
            sprintf('Nouvelle réservation partenaire de %s en attente.', $appointment->partner?->name ?? 'un partenaire'),
            $appointment,
        );
    }

    /** Nouvelle reservation depuis l'application mobile publique. */
    public function publicBookingCreated(Appointment $appointment): void
    {
        $this->notifyStaff(
            'public_booking_created',
            sprintf(
                'Nouvelle réservation depuis l’app mobile : %s — %s le %s à %s.',
                $appointment->client?->name ?? 'Client',
                $appointment->service?->name ?? 'Prestation',
                $appointment->starts_at?->format('d/m/Y') ?? '?',
                $appointment->starts_at?->format('H:i') ?? '?',
            ),
            $appointment,
        );
    }

    public function bookingConfirmed(Appointment $appointment): void
    {
        $this->notifyPartner(
            'booking_confirmed',
            sprintf('Votre réservation RSV-%d a été confirmée par BOGOSLAND.', $appointment->id),
            $appointment,
        );
    }

    public function bookingRefused(Appointment $appointment): void
    {
        $this->notifyPartner(
            'booking_refused',
            sprintf('Votre réservation RSV-%d a été refusée par BOGOSLAND.', $appointment->id),
            $appointment,
        );
    }

    public function alternateProposed(Appointment $appointment): void
    {
        $this->notifyPartner(
            'alternate_proposed',
            sprintf('BOGOSLAND vous propose un nouveau créneau pour la réservation RSV-%d.', $appointment->id),
            $appointment,
        );
    }

    public function proposalAccepted(Appointment $appointment): void
    {
        $this->notifyStaff(
            'proposal_accepted',
            sprintf('Le partenaire a accepté le créneau proposé pour RSV-%d.', $appointment->id),
            $appointment,
        );
    }

    public function proposalDeclined(Appointment $appointment): void
    {
        $this->notifyStaff(
            'proposal_declined',
            sprintf('Le partenaire a refusé le créneau proposé pour RSV-%d.', $appointment->id),
            $appointment,
        );
    }

    private function notifyPartner(string $type, string $message, Appointment $appointment): void
    {
        $user = $appointment->partner?->user;
        if (! $user) {
            return;
        }
        $this->send($user, $type, $message, $appointment);
    }

    private function notifyStaff(string $type, string $message, Appointment $appointment): void
    {
        $admins = User::role(['admin', 'super-admin'])->get();
        if ($admins->isEmpty()) {
            return;
        }
        $this->send($admins, $type, $message, $appointment);
    }

    private function send($notifiable, string $type, string $message, Appointment $appointment): void
    {
        try {
            Notification::send($notifiable, new AppointmentNotification($type, $message, [
                'appointment_id' => $appointment->id,
            ]));
        } catch (Throwable $e) {
            Log::warning('Appointment notification failed to send.', [
                'type' => $type,
                'appointment_id' => $appointment->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
