<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Partner;
use App\Models\PartnerCommission;
use App\Models\PartnerLandingSetting;
use App\Models\PartnerOffering;
use App\Models\PartnerQrToken;
use App\Models\PartnerQrVisit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * LE QR PARTENAIRE — jeton, vitrine, visites, statistiques.
 *
 * Ce service ne decide jamais d'une commission ni ne cree de reservation : il
 * resout QUI est le partenaire derriere un jeton et CE QU'IL a le droit de
 * montrer. La reservation reste l'affaire de PublicBookingService, la
 * commission celle de PartnerCommissionService. Aucun systeme parallele.
 *
 * La regle de securite tient en une phrase : le partenaire vient TOUJOURS du
 * jeton present dans l'URL, resolu ici, jamais d'un champ envoye par le
 * navigateur.
 */
class PartnerQrService
{
    /** Longueur du jeton public. Meme ordre de grandeur que ClientQrToken. */
    private const TOKEN_LENGTH = 48;

    /**
     * Emet un jeton neuf et revoque le precedent, dans la meme transaction.
     *
     * Revoquer plutot que supprimer : les affiches deja imprimees cessent
     * d'attribuer, mais on garde la trace de ce qui a circule — et les visites
     * passees gardent leur jeton d'origine.
     */
    public function issueToken(Partner $partner): PartnerQrToken
    {
        return DB::transaction(function () use ($partner) {
            PartnerQrToken::where('partner_id', $partner->id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            return PartnerQrToken::create([
                'partner_id' => $partner->id,
                'token' => $this->freshToken(),
            ]);
        });
    }

    /** Le jeton actif, emis a la volee la premiere fois qu'on le demande. */
    public function currentToken(Partner $partner): PartnerQrToken
    {
        $token = PartnerQrToken::where('partner_id', $partner->id)
            ->whereNull('revoked_at')
            ->latest('id')
            ->first();

        return $token ?? $this->issueToken($partner);
    }

    /** Coupe le QR sans en emettre un autre : plus aucune attribution. */
    public function revokeTokens(Partner $partner): void
    {
        PartnerQrToken::where('partner_id', $partner->id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * Resout un jeton public. Ne renvoie QUE des jetons actifs : un jeton
     * revoque est traite exactement comme un jeton inexistant, aucune fuite.
     */
    public function resolveToken(string $token): ?PartnerQrToken
    {
        return PartnerQrToken::with('partner')
            ->where('token', $token)
            ->whereNull('revoked_at')
            ->first();
    }

    public function publicUrl(string $token): string
    {
        return rtrim(config('app.url'), '/').'/p/'.$token;
    }

    private function freshToken(): string
    {
        do {
            $token = Str::random(self::TOKEN_LENGTH);
        } while (PartnerQrToken::where('token', $token)->exists());

        return $token;
    }

    // ------------------------------------------------------------ vitrine

    /**
     * Les offres reellement montrables aujourd'hui, dans l'ordre voulu par
     * l'administration : les mises en avant d'abord.
     *
     * Le meme filtre `bookable()` sert a l'affichage et a la validation d'une
     * reservation : rien ne peut etre reserve sans etre visible, et
     * reciproquement.
     *
     * @return Collection<int, PartnerOffering>
     */
    public function bookableOfferings(Partner $partner, ?Carbon $on = null): Collection
    {
        return PartnerOffering::query()
            ->with(['service', 'pack.items.service'])
            ->where('partner_id', $partner->id)
            ->bookable($on)
            ->orderByDesc('is_featured')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    /** Une offre precise de CE partenaire, ou null. Jamais celle d'un autre. */
    public function findBookableOffering(Partner $partner, int $offeringId, ?Carbon $on = null): ?PartnerOffering
    {
        return PartnerOffering::query()
            ->with(['service', 'pack.items.service'])
            ->where('partner_id', $partner->id)
            ->whereKey($offeringId)
            ->bookable($on)
            ->first();
    }

    public function landingSetting(Partner $partner): PartnerLandingSetting
    {
        return PartnerLandingSetting::firstOrNew(
            ['partner_id' => $partner->id],
            ['is_enabled' => true],
        );
    }

    /**
     * La page est-elle ouverte au public ? Trois verrous independants : le
     * partenaire doit etre operationnel, sa page activee, et son jeton actif
     * (ce dernier est deja garanti par resolveToken).
     */
    public function landingIsOpen(Partner $partner): bool
    {
        return $partner->canOperate() && $this->landingSetting($partner)->is_enabled;
    }

    // ------------------------------------------------------------ visites

    /**
     * Empreinte anonyme d'un visiteur.
     *
     * Le navigateur envoie un identifiant de session opaque qu'il a tire lui
     * meme (sessionStorage) ; a defaut on retombe sur IP + user-agent. Dans
     * les deux cas la valeur est HACHEE avec la cle de l'application : rien
     * d'identifiant n'est stocke en clair, et deux partenaires ne peuvent pas
     * recouper leurs visiteurs.
     */
    public function visitorKey(Request $request, ?string $clientSessionId = null): string
    {
        $raw = $clientSessionId !== null && trim($clientSessionId) !== ''
            ? 'sid:'.trim($clientSessionId)
            : 'ip:'.$request->ip().'|ua:'.(string) $request->userAgent();

        return hash_hmac('sha256', $raw, (string) config('app.key'));
    }

    /**
     * Enregistre une visite — une par session et par partenaire.
     *
     * Un rafraichissement incremente `hits` et repousse `last_seen_at` : il ne
     * cree pas un second scan, sans quoi le taux de conversion ne voudrait
     * plus rien dire. `updateOrCreate` sur la cle unique rend l'appel
     * idempotent, y compris si deux onglets arrivent en meme temps.
     */
    public function recordVisit(PartnerQrToken $token, string $visitorKey): PartnerQrVisit
    {
        $now = now();

        $visit = PartnerQrVisit::firstOrCreate(
            ['partner_id' => $token->partner_id, 'visitor_key' => $visitorKey],
            [
                'partner_qr_token_id' => $token->id,
                'hits' => 1,
                'first_seen_at' => $now,
                'last_seen_at' => $now,
            ],
        );

        if (! $visit->wasRecentlyCreated) {
            $visit->increment('hits');
            $visit->forceFill(['last_seen_at' => $now])->save();
        }

        return $visit;
    }

    /**
     * Referme la boucle : cette visite a donne cette reservation. Une visite
     * ne convertit qu'une fois — la deuxieme reservation du meme visiteur
     * reste comptee comme reservation, mais ne re-compte pas la conversion.
     */
    public function markConverted(?PartnerQrVisit $visit, Appointment $appointment): void
    {
        if ($visit === null || $visit->converted_at !== null) {
            return;
        }

        $visit->forceFill([
            'appointment_id' => $appointment->id,
            'converted_at' => now(),
        ])->save();
    }

    // ------------------------------------------------------- statistiques

    /**
     * Le tableau de bord d'un QR. Memes chiffres pour l'administration et
     * pour le partenaire — une seule source, aucune divergence possible.
     *
     * Definitions, calees sur les statuts reels du projet :
     *  - « reservations » : toutes celles nees du QR, quel que soit leur sort ;
     *  - « confirmees » : statut `confirmed` ou `completed` ;
     *  - « CA genere » : la base des commissions partenaire reellement
     *    accrochees (donc de l'argent encaisse), annulations exclues ;
     *  - « commission » : ces memes lignes, montant du.
     *
     * @return array<string, mixed>
     */
    public function stats(Partner $partner, ?Carbon $from = null, ?Carbon $to = null): array
    {
        $visits = PartnerQrVisit::where('partner_id', $partner->id)
            ->when($from, fn ($q) => $q->where('first_seen_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('first_seen_at', '<=', $to));

        $appointments = Appointment::where('partner_id', $partner->id)
            ->where('source', Appointment::SOURCE_PARTNER_QR)
            ->when($from, fn ($q) => $q->where('starts_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('starts_at', '<=', $to));

        $visitCount = (clone $visits)->count();
        $bookings = (clone $appointments)->count();
        $confirmed = (clone $appointments)->whereIn('status', ['confirmed', 'completed'])->count();

        // Le CA et la commission viennent du ledger existant, restreint aux
        // prestations nees d'une reservation QR de ce partenaire. On ne
        // recalcule rien : ce sont les memes lignes que la page Commissions.
        $ledger = PartnerCommission::query()
            ->where('partner_commissions.partner_id', $partner->id)
            ->where('partner_commissions.status', '!=', PartnerCommission::STATUS_CANCELLED)
            ->whereIn('partner_commissions.prestation_id', function ($query) use ($partner) {
                $query->select('prestations.id')
                    ->from('prestations')
                    ->join('appointments', 'appointments.id', '=', 'prestations.appointment_id')
                    ->where('appointments.partner_id', $partner->id)
                    ->where('appointments.source', Appointment::SOURCE_PARTNER_QR);
            });

        $revenue = round((float) (clone $ledger)->sum('base_amount'), 2);
        $commission = round((float) (clone $ledger)->sum('amount'), 2);

        return [
            'visits' => $visitCount,
            'bookings' => $bookings,
            'confirmed_bookings' => $confirmed,
            'revenue_total' => $revenue,
            'commission_total' => $commission,
            'conversion_rate' => $visitCount > 0 ? round($bookings * 100 / $visitCount, 1) : 0.0,
        ];
    }
}
