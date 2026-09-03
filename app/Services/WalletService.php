<?php

namespace App\Services;

use App\Models\CommissionPayout;
use App\Models\Advance;
use App\Models\Employee;
use App\Models\Expense;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WorkDay;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Le portefeuille : la seule autorité sur « où est l'argent ».
 *
 * Ce service répond, sans aucun calcul manuel, aux six questions qui motivaient
 * sa création : combien reste chez chaque admin, combien est parti chez le
 * patron, combien dort en fond de caisse, combien est passé en dépenses, de
 * quelle journée vient chaque montant, et est-ce que les soldes correspondent
 * exactement aux mouvements enregistrés.
 *
 * TROIS RÈGLES STRUCTURANTES
 *
 * 1. DATE DE DÉMARRAGE. Le portefeuille commence le 1er septembre 2026
 *    (config/wallet.php). Une journée de caisse antérieure n'alimente JAMAIS un
 *    solde — qu'on la consulte, la modifie ou la re-clôture après coup. Juillet
 *    et août restent entiers dans les rapports historiques ; ils y sont
 *    informatifs, et c'est tout. Aucun backfill n'existe, et il ne doit pas en
 *    exister : les portefeuilles naissent à zéro.
 *
 *    Ce n'est pas une borne mensuelle. Le solde est CONTINU : 800 DH au 30
 *    septembre valent 800 DH au 1er octobre. Les mois ne servent qu'aux
 *    filtres et aux rapports.
 *
 * 2. LE LEDGER FAIT FOI. `wallets.balance` et `wallets.cash_fund_balance` sont
 *    des soldes matérialisés, écrits ici et nulle part ailleurs, toujours dans
 *    la même transaction que la ligne de ledger. `reconcile()` les recalcule
 *    depuis les mouvements et signale tout écart.
 *
 * 3. RIEN NE DISPARAÎT. Aucune ligne n'est jamais supprimée ni modifiée. Une
 *    correction s'écrit comme un `ADJUSTMENT` inverse pointant sur la ligne
 *    fautive : l'erreur et sa correction restent toutes deux lisibles.
 *
 * ARITHMÉTIQUE. Tous les calculs se font en centimes entiers et ne repassent en
 * décimal qu'au moment d'écrire. C'est ce qui garantit que 18 856,00 se
 * retrouve bien à 18 856,00 après cinquante mouvements, et pas à 18 855,99.
 */
class WalletService
{
    /**
     * Motifs de paiement d'un employé.
     *
     * `advance` est le seul qui crée en plus une obligation : l'argent est
     * sorti, mais l'employé le doit encore et la paie le nettera. Les autres
     * ne sont que des mouvements — ce qui était dû l'était déjà par ailleurs.
     */
    public const PAYMENT_SALARY = 'salary';

    public const PAYMENT_COMMISSION = 'commission';

    public const PAYMENT_ADVANCE = 'advance';

    public const PAYMENT_BONUS = 'bonus';

    public const PAYMENT_OTHER = 'other';

    public const PAYMENT_KINDS = [
        self::PAYMENT_SALARY,
        self::PAYMENT_COMMISSION,
        self::PAYMENT_ADVANCE,
        self::PAYMENT_BONUS,
        self::PAYMENT_OTHER,
    ];

    public const PAYMENT_LABELS = [
        self::PAYMENT_SALARY => 'Salaire',
        self::PAYMENT_COMMISSION => 'Commission',
        self::PAYMENT_ADVANCE => 'Avance',
        self::PAYMENT_BONUS => 'Prime',
        self::PAYMENT_OTHER => 'Autre',
    ];

    /** Les deux sources possibles d'un paiement à un employé. */
    public const SOURCE_WALLET = 'wallet';

    public const SOURCE_CAISSE = 'caisse';

    /**
     * Marqueur écrit par CommissionPayoutService quand « sortie de caisse »
     * est cochée : le net versé devient une avance déjà soldée sur la journée
     * ouverte. C'est le seul signal qui distingue, dans `advances`, un
     * versement de commission d'une vraie avance sur salaire.
     */
    private const CAISSE_COMMISSION_MARKER = 'Paiement commission %';

    public function __construct(
        private readonly ActivityLogger $activityLogger,
        private readonly CommissionPayoutService $payouts,
        private readonly EmployeeEarningsService $earnings,
    ) {
    }

    // =========================================================================
    // Périmètre temporel
    // =========================================================================

    /** Le jour où le portefeuille commence à compter. */
    public function startDate(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) config('wallet.start_date', '2026-09-01'))->startOfDay();
    }

    /**
     * Cette date alimente-t-elle le portefeuille ?
     *
     * Le test porte sur la date métier (la date de la journée de caisse), pas
     * sur l'instant d'exécution : re-traiter le 15 août en octobre reste hors
     * périmètre.
     */
    public function isWithinScope(CarbonInterface|string|null $date): bool
    {
        if ($date === null) {
            return false;
        }

        return CarbonImmutable::parse($date)->startOfDay()->greaterThanOrEqualTo($this->startDate());
    }

    // =========================================================================
    // Résolution des portefeuilles
    // =========================================================================

    /** Le portefeuille de ce compte, créé à zéro s'il n'existe pas encore. */
    public function walletFor(User $user): Wallet
    {
        $wallet = Wallet::where('user_id', $user->id)->first();

        if ($wallet !== null) {
            return $wallet;
        }

        return Wallet::create([
            'user_id' => $user->id,
            'type' => $this->typeFor($user),
            'is_active' => true,
        ]);
    }

    /**
     * Le portefeuille du patron, destination de « Envoyer au Super Admin ».
     *
     * Désigné par `wallet.super_admin_user_id` quand plusieurs super-admins
     * coexistent ; sinon le premier créé. Renvoie null si l'installation n'a
     * aucun super-admin — l'appelant doit alors refuser proprement le transfert
     * plutôt que d'inventer une destination.
     */
    public function superAdminWallet(): ?Wallet
    {
        $configured = config('wallet.super_admin_user_id');

        if ($configured !== null && $configured !== '') {
            $user = User::find((int) $configured);

            if ($user !== null) {
                return $this->walletFor($user);
            }
        }

        $superAdmin = User::role('super-admin')->orderBy('id')->first();

        return $superAdmin === null ? null : $this->walletFor($superAdmin);
    }

    private function typeFor(User $user): string
    {
        return $user->hasRole('super-admin') ? Wallet::TYPE_SUPER_ADMIN : Wallet::TYPE_ADMIN;
    }

    // =========================================================================
    // 1. Crédit automatique du résultat de caisse
    // =========================================================================

    /**
     * Crédite le résultat d'une journée clôturée au portefeuille de l'admin
     * responsable. Appelé DANS la transaction de `WorkDayService::closeDay()`.
     *
     * Renvoie null — sans rien écrire et sans lever d'erreur — dans les quatre
     * cas où il n'y a légitimement rien à créditer :
     *
     *  - la journée est antérieure au 1er septembre 2026 ;
     *  - la journée est déjà créditée (idempotence) ;
     *  - aucun responsable identifiable ;
     *  - un résultat nul, qui n'a aucun mouvement à raconter.
     *
     * Un résultat NÉGATIF, lui, est bien écrit : une journée où les dépenses
     * dépassent la recette a coûté de l'argent à l'admin, et le taire ferait
     * mentir le solde. C'est le seul mouvement autorisé à passer un
     * portefeuille sous zéro — tous les retraits manuels sont plafonnés au
     * disponible.
     *
     * L'idempotence tient sur deux verrous : la vérification ci-dessous, et
     * l'index unique `wallet_tx_source_unique` qui attrape la course entre la
     * vérification et l'écriture.
     */
    public function creditWorkDayResult(WorkDay $day, float $netResult, ?User $actor = null): ?WalletTransaction
    {
        if (! $this->isWithinScope($day->date)) {
            return null;
        }

        $existing = $this->workDayCreditFromDatabase($day);

        if ($existing !== null) {
            return $existing;
        }

        $owner = $this->workDayOwner($day, $actor);

        if ($owner === null) {
            return null;
        }

        $cents = $this->toCents($netResult);

        if ($cents === 0) {
            return null;
        }

        $wallet = $this->walletFor($owner);
        $occurredAt = CarbonImmutable::parse($day->date)->startOfDay();

        try {
            return DB::transaction(function () use ($wallet, $day, $cents, $actor, $occurredAt) {
                $locked = $this->lock($wallet);

                // Relu sous verrou, et TOUJOURS depuis la base : deux
                // clôtures concurrentes de la même journée ne peuvent plus
                // créditer chacune la leur.
                $already = $this->workDayCreditFromDatabase($day);

                if ($already !== null) {
                    return $already;
                }

                return $this->write($locked, [
                    'type' => WalletTransaction::TYPE_CASH_REGISTER_RESULT,
                    'cents' => $cents,
                    'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                    'source' => $day,
                    'performed_by_user_id' => $actor?->id ?? $day->opened_by_user_id,
                    'description' => 'Resultat de la caisse du '.CarbonImmutable::parse($day->date)->format('d/m/Y'),
                    'occurred_at' => $occurredAt,
                ]);
            });
        } catch (QueryException $exception) {
            // L'index unique a tranché une course : la journée est créditée,
            // une seule fois, et c'est exactement ce qu'on voulait.
            if ($this->isUniqueViolation($exception)) {
                return $this->workDayCredit($day);
            }

            throw $exception;
        }
    }

    /**
     * Le crédit déjà enregistré pour cette journée, s'il existe.
     *
     * Quand `walletTransactions` a été chargé en amont — ce que font les écrans
     * qui affichent soixante journées d'un coup — la réponse se lit en mémoire
     * plutôt qu'en une requête par ligne.
     */
    public function workDayCredit(WorkDay $day): ?WalletTransaction
    {
        if ($day->relationLoaded('walletTransactions')) {
            return $day->walletTransactions
                ->firstWhere('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT);
        }

        return $this->workDayCreditFromDatabase($day);
    }

    /**
     * La même lecture, mais jamais depuis une relation déjà chargée.
     *
     * C'est ce que doit utiliser tout contrôle d'idempotence : une collection
     * chargée avant l'écriture ne connaît pas les lignes apparues depuis, et
     * s'y fier autoriserait précisément le double crédit qu'on interdit.
     */
    private function workDayCreditFromDatabase(WorkDay $day): ?WalletTransaction
    {
        return WalletTransaction::where('source_type', $day->getMorphClass())
            ->where('source_id', $day->getKey())
            ->where('type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)
            ->first();
    }

    /**
     * L'admin responsable de la journée — celui dont le portefeuille reçoit.
     *
     * La règle a une contrainte de plus que « celui qui a ouvert » : le
     * résultat d'une caisse va à l'ADMIN qui tient le tiroir, jamais au
     * patron par accident. Une journée ouverte avec le compte Super Admin
     * (une habitude, un test, un dépannage) créditait le portefeuille du
     * patron — l'argent sautait l'étape « détenu par l'admin », et les vues
     * Trésorerie et Portefeuille racontaient toutes deux une histoire fausse.
     *
     * D'où l'ordre : l'ouvreur s'il n'est pas super-admin, sinon celui qui
     * clôture s'il ne l'est pas. Si la journée a été entièrement tenue par le
     * patron, alors oui, son portefeuille est le bon — c'est lui qui a
     * l'argent — et ce repli est assumé.
     */
    private function workDayOwner(WorkDay $day, ?User $actor): ?User
    {
        $opener = $day->opened_by_user_id !== null
            ? User::find($day->opened_by_user_id)
            : null;

        foreach ([$opener, $actor] as $candidate) {
            if ($candidate !== null && ! $candidate->hasRole('super-admin')) {
                return $candidate;
            }
        }

        return $opener ?? $actor;
    }

    /**
     * L'état « portefeuille » d'une journée, tel que l'affichent les rapports.
     *
     * `out_of_scope` n'est pas une anomalie : c'est une journée d'avant le
     * démarrage, dont le résultat reste juste et lisible dans les rapports
     * historiques sans jamais avoir alimenté un solde.
     *
     * @return array<string, mixed>
     */
    public function workDayStatus(WorkDay $day, ?float $netResult = null): array
    {
        $credit = $this->workDayCredit($day);
        $reversal = $credit === null
            ? null
            : WalletTransaction::where('reverses_transaction_id', $credit->id)->first();
        // Un crédit contre-passé PUIS réécrit ailleurs n'est pas une
        // annulation : le résultat existe toujours, dans un autre
        // portefeuille. C'est ce mouvement-là qui dit où est l'argent.
        $reattribution = $reversal === null ? null : $this->workDayReattribution($day);

        $movement = $reattribution ?? $credit;
        $movement?->loadMissing('wallet.user');

        $status = match (true) {
            $reattribution !== null => 'reattributed',
            $credit !== null && $reversal !== null => 'reversed',
            $credit !== null => 'credited',
            ! $this->isWithinScope($day->date) => 'out_of_scope',
            $day->status !== 'closed' => 'pending',
            $netResult !== null && $this->toCents($netResult) === 0 => 'zero',
            default => 'not_credited',
        };

        return [
            'status' => $status,
            'start_date' => $this->startDate()->toDateString(),
            'amount' => $movement?->signedAmount(),
            'transaction_id' => $movement?->id,
            'credited_at' => $movement?->created_at?->toIso8601String(),
            'wallet_id' => $movement?->wallet_id,
            'wallet_owner' => $movement?->wallet?->user?->name,
        ];
    }

    /**
     * Le crédit de réattribution de cette journée, s'il est encore actif.
     *
     * C'est l'ajustement marqué `cash_register_correction` qui pointe la
     * journée — celui qu'écrit `reattributeWorkDayResult()`. Une
     * réattribution elle-même contre-passée ne dit plus où est l'argent, et
     * ne compte donc pas.
     */
    private function workDayReattribution(WorkDay $day): ?WalletTransaction
    {
        $adjustment = WalletTransaction::where('source_type', $day->getMorphClass())
            ->where('source_id', $day->getKey())
            ->where('type', WalletTransaction::TYPE_ADJUSTMENT)
            ->where('category', WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION)
            ->first();

        if ($adjustment === null) {
            return null;
        }

        return WalletTransaction::where('reverses_transaction_id', $adjustment->id)->exists()
            ? null
            : $adjustment;
    }

    // =========================================================================
    // 2. Transferts entre portefeuilles (double ecriture)
    // =========================================================================

    /**
     * Débite l'admin et crédite le patron — deux écritures, une seule
     * transaction. Si l'une échoue, aucune n'a lieu.
     *
     * Les deux portefeuilles sont verrouillés dans l'ordre de leurs
     * identifiants : deux transferts croisés simultanés s'attendent au lieu de
     * s'interbloquer.
     *
     * @return array{out: WalletTransaction, in: WalletTransaction}
     */
    public function transferToSuperAdmin(
        Wallet $from,
        float $amount,
        User $actor,
        ?string $description = null,
        ?string $reference = null,
        bool $allowDuplicate = false,
    ): array {
        $destination = $this->superAdminWallet();

        if ($destination === null) {
            throw ValidationException::withMessages([
                'amount' => "Aucun compte Super Admin n'est configuré pour recevoir ce transfert.",
            ]);
        }

        return $this->transfer(
            $from,
            $destination,
            WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN,
            $amount,
            $actor,
            $description ?: 'Remise au Super Admin',
            $reference,
            $allowDuplicate,
        );
    }

    /**
     * Le chemin inverse : le patron renvoie de l'argent à un admin.
     *
     * Même mécanique, mêmes garanties, sens opposé — et surtout le même code,
     * pour qu'aucune des deux directions ne puisse un jour se mettre à
     * verrouiller ou à arrondir autrement que l'autre.
     *
     * Le portefeuille source doit être celui d'un Super Admin : c'est ce qui
     * empêche un admin d'emprunter cette route pour se virer de l'argent
     * depuis n'importe quel portefeuille.
     *
     * @return array{out: WalletTransaction, in: WalletTransaction}
     */
    public function transferToAdmin(
        Wallet $from,
        Wallet $destination,
        float $amount,
        User $actor,
        ?string $description = null,
        ?string $reference = null,
        bool $allowDuplicate = false,
    ): array {
        if (! $from->isSuperAdmin()) {
            throw ValidationException::withMessages([
                'amount' => 'Seul le portefeuille du Super Admin peut envoyer de l\'argent à un Admin.',
            ]);
        }

        // La destination doit etre un admin. Sans cette garde, un virement
        // entre deux comptes patron s'ecrirait « envoi a un Admin » et
        // fausserait le total « renvoye aux admins » de la vue globale.
        if ($destination->isSuperAdmin()) {
            throw ValidationException::withMessages([
                'wallet_id' => 'La destination doit être le portefeuille d\'un Admin.',
            ]);
        }

        return $this->transfer(
            $from,
            $destination,
            WalletTransaction::TYPE_TRANSFER_TO_ADMIN,
            $amount,
            $actor,
            $description ?: 'Envoi du Super Admin',
            $reference,
            $allowDuplicate,
        );
    }

    /**
     * La double écriture, une fois pour toutes.
     *
     * Débit d'un côté, crédit de l'autre, une seule transaction : il ne peut
     * pas exister d'état où l'argent a quitté un portefeuille sans arriver
     * dans l'autre. Les deux lignes partagent un `transfer_group`, donc le
     * transfert se relit — et se contre-passe — comme un tout.
     *
     * Les deux portefeuilles sont verrouillés dans l'ordre de leurs
     * identifiants : deux transferts croisés simultanés s'attendent au lieu de
     * s'interbloquer.
     *
     * @return array{out: WalletTransaction, in: WalletTransaction}
     */
    private function transfer(
        Wallet $from,
        Wallet $destination,
        string $type,
        float $amount,
        User $actor,
        string $label,
        ?string $reference,
        bool $allowDuplicate,
    ): array {
        if ($destination->id === $from->id) {
            throw ValidationException::withMessages([
                'amount' => 'Un portefeuille ne peut pas se transférer de l\'argent à lui-même.',
            ]);
        }

        $cents = $this->positiveCents($amount);

        if (! $allowDuplicate) {
            $this->assertNotAnImmediateDuplicate($from, $destination, $type, $cents);
        }

        return DB::transaction(function () use ($from, $destination, $type, $cents, $actor, $label, $reference) {
            [$lockedFrom, $lockedTo] = $this->lockPair($from, $destination);

            $this->assertAvailable($lockedFrom, $cents);

            $group = (string) Str::uuid();

            $out = $this->write($lockedFrom, [
                'type' => $type,
                'cents' => -$cents,
                'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                'counterparty_wallet_id' => $lockedTo->id,
                'transfer_group' => $group,
                'performed_by_user_id' => $actor->id,
                'description' => $label,
                'reference' => $reference,
            ]);

            $in = $this->write($lockedTo, [
                'type' => $type,
                'cents' => $cents,
                'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                'counterparty_wallet_id' => $lockedFrom->id,
                'transfer_group' => $group,
                'performed_by_user_id' => $actor->id,
                'description' => $label.' — '.($lockedFrom->user->name ?? 'Portefeuille'),
                'reference' => $reference,
            ]);

            $this->activityLogger->log('wallet.transfer', $out, [], [
                'type' => $type,
                'from_wallet_id' => $lockedFrom->id,
                'to_wallet_id' => $lockedTo->id,
                'amount' => $this->fromCents($cents),
                'transfer_group' => $group,
            ]);

            return ['out' => $out, 'in' => $in];
        });
    }

    /**
     * Garde-fou contre le double envoi (double tap, requête rejouée) : un
     * transfert identique — mêmes portefeuilles, même type, même montant —
     * dans la minute est refusé avec un message explicite. Deux remises
     * réellement identiques à une minute d'intervalle restent possibles en
     * passant `allow_duplicate`.
     */
    private function assertNotAnImmediateDuplicate(Wallet $from, Wallet $to, string $type, int $cents): void
    {
        $exists = WalletTransaction::where('wallet_id', $from->id)
            ->where('counterparty_wallet_id', $to->id)
            ->where('type', $type)
            ->where('direction', WalletTransaction::DIRECTION_OUT)
            ->where('amount', $this->fromCents($cents))
            ->where('created_at', '>=', now()->subMinute())
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'amount' => 'Un transfert identique vient d\'être enregistré. Confirmez pour en envoyer un second.',
            ]);
        }
    }

    // =========================================================================
    // 2 bis. Apport du patron
    // =========================================================================

    /**
     * Charge le portefeuille du patron avec de l'argent venu de l'extérieur.
     *
     * C'est le SEUL geste de tout le système qui fait apparaître de l'argent
     * sans qu'il vienne d'une journée de caisse ou d'un autre portefeuille.
     * D'où les trois verrous : le portefeuille doit être de type
     * `super_admin`, la route est gardée par `wallet.deposit` (Super Admin
     * seul), et le motif est obligatoire — un apport sans explication ne se
     * relit pas six mois plus tard.
     *
     * Comme partout ailleurs, `wallets.balance` n'est jamais touché
     * directement : l'écriture passe par `write()`, donc par le ledger.
     */
    public function deposit(
        Wallet $wallet,
        float $amount,
        string $reason,
        User $actor,
        ?string $reference = null,
        ?string $notes = null,
    ): WalletTransaction {
        if (! $wallet->isSuperAdmin()) {
            throw ValidationException::withMessages([
                'amount' => 'Seul le portefeuille du Super Admin peut recevoir un apport.',
            ]);
        }

        $cents = $this->positiveCents($amount);

        return DB::transaction(function () use ($wallet, $cents, $reason, $actor, $reference, $notes) {
            $locked = $this->lock($wallet);

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_OWNER_DEPOSIT,
                'cents' => $cents,
                'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                'performed_by_user_id' => $actor->id,
                'category' => 'apport',
                'reference' => $reference,
                // Le motif porte le sens, la note le detail. Les deux sont
                // conserves tels quels : c'est tout ce qui reste pour
                // expliquer une entree d'argent sans origine interne.
                'description' => $notes === null ? $reason : $reason.' — '.$notes,
            ]);

            $this->activityLogger->log('wallet.deposit', $transaction, [], [
                'wallet_id' => $locked->id,
                'amount' => $this->fromCents($cents),
                'reason' => $reason,
            ]);

            return $transaction;
        });
    }

    // =========================================================================
    // 3. Dépenses
    // =========================================================================

    /**
     * Enregistre une dépense payée sur le portefeuille.
     *
     * La dépense est une vraie ligne de la table `expenses` (`origin=wallet`),
     * pas un doublon maison : mêmes colonnes, même modèle, même historique. Ce
     * qui la distingue d'une dépense de caisse, c'est qu'elle porte un
     * `wallet_id`, aucune journée, et qu'elle est exclue des agrégats de caisse
     * par `Expense::caisse()` — sans quoi elle serait comptée deux fois.
     *
     * @param  array{amount: float, label: string, category?: string|null, spent_on?: string|null, notes?: string|null, reference?: string|null}  $data
     */
    public function recordExpense(Wallet $wallet, array $data, User $actor): WalletTransaction
    {
        $cents = $this->positiveCents((float) $data['amount']);
        $spentOn = CarbonImmutable::parse($data['spent_on'] ?? now()->toDateString())->startOfDay();

        return DB::transaction(function () use ($wallet, $data, $actor, $cents, $spentOn) {
            $locked = $this->lock($wallet);

            $this->assertAvailable($locked, $cents);

            $expense = Expense::create([
                'work_day_id' => null,
                'origin' => Expense::ORIGIN_WALLET,
                'wallet_id' => $locked->id,
                'user_id' => $actor->id,
                'label' => $data['label'],
                'category' => $data['category'] ?: 'general',
                'amount' => $this->fromCents($cents),
                'spent_on' => $spentOn->toDateString(),
                'reference' => $data['reference'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_EXPENSE,
                'cents' => -$cents,
                'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                'source' => $expense,
                'performed_by_user_id' => $actor->id,
                'category' => $expense->category,
                'reference' => $expense->reference,
                'description' => $expense->label,
                'occurred_at' => $spentOn,
            ]);

            $this->activityLogger->log('wallet.expense', $expense, [], [
                'wallet_id' => $locked->id,
                'amount' => $this->fromCents($cents),
                'category' => $expense->category,
            ]);

            return $transaction;
        });
    }

    // =========================================================================
    // 3 bis. Paiement des employés
    // =========================================================================

    /**
     * Paie un employé sur l'argent que l'admin détient.
     *
     * LA DISTINCTION QUI COMPTE. L'application connaissait déjà les
     * commissions (ce qui est GAGNÉ) et les paies mensuelles (le mois SOLDÉ) :
     * ce sont des obligations. Ce qu'elle ne savait pas dire, c'est quand
     * l'argent était réellement sorti de la poche de l'admin — un
     * `commission_payout` sans sortie de caisse ne laissait aucune trace.
     * C'est ce trou-là, et uniquement celui-là, que ce mouvement comble.
     *
     * Ce paiement ne touche donc JAMAIS la caisse : ni dépense, ni journée.
     * Le résultat de caisse ne bouge pas d'un centime, et rien ne peut être
     * compté deux fois de ce côté.
     *
     * Deux motifs demandent une attention particulière :
     *
     *  - `advance` crée en plus une vraie `Advance` (origine `wallet`, sans
     *    journée de caisse). L'argent est sorti ET l'employé le doit encore :
     *    `CommissionPayoutService` la nettera à la paie comme n'importe quelle
     *    autre avance. Sans cette ligne, le salon paierait deux fois.
     *  - `commission` est refusé quand la paie de cette période est déjà
     *    sortie du tiroir (`deduct_from_caisse`), parce que cet argent-là a
     *    déjà réduit le résultat de caisse, donc déjà réduit ce portefeuille.
     *
     * @param  array{amount: float, kind: string, period?: string|null, note?: string|null, reference?: string|null}  $data
     */
    public function payEmployee(
        Wallet $wallet,
        Employee $employee,
        array $data,
        User $actor,
        bool $acknowledgeDuplicate = false,
        bool $acknowledgeOverDue = false,
    ): WalletTransaction {
        $cents = $this->positiveCents((float) $data['amount']);
        $kind = $data['kind'];
        $period = $data['period'] ?? null;
        $note = $data['note'] ?? null;

        if (! $acknowledgeDuplicate) {
            if ($kind === self::PAYMENT_COMMISSION && $period !== null) {
                $this->assertCommissionNotAlreadyPaidFromCaisse($employee, $period);
            }

            $this->assertNotAnImmediateDuplicatePayment($wallet, $employee, $kind, $cents);
        }

        if (! $acknowledgeOverDue) {
            $this->assertNotOverDue($employee, $kind, $period, $cents);
        }

        return DB::transaction(function () use ($wallet, $employee, $cents, $kind, $period, $note, $data, $actor) {
            $locked = $this->lock($wallet);

            $this->assertAvailable($locked, $cents);

            $label = $this->paymentLabel($kind, $period);
            $source = null;

            if ($kind === self::PAYMENT_ADVANCE) {
                // `work_day_id` volontairement nul : cette avance n'est pas
                // sortie du tiroir, elle est sortie du portefeuille. C'est
                // `origin` qui l'exclut des agrégats de caisse, et son absence
                // de journée qui l'exclut du rapport journalier.
                $source = Advance::create([
                    'employee_id' => $employee->id,
                    'work_day_id' => null,
                    'origin' => Advance::ORIGIN_WALLET,
                    'amount' => $this->fromCents($cents),
                    'reason' => $note ?: $label,
                    'given_on' => now()->toDateString(),
                ]);
            }

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_EMPLOYEE_PAYMENT,
                'cents' => -$cents,
                'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                'performed_by_user_id' => $actor->id,
                'employee_id' => $employee->id,
                'period' => $period,
                'category' => $kind,
                'reference' => $data['reference'] ?? null,
                'source' => $source,
                'description' => $note === null ? $label : $label.' — '.$note,
            ]);

            $this->activityLogger->log('wallet.employee_payment', $transaction, [], [
                'wallet_id' => $locked->id,
                'employee_id' => $employee->id,
                'employee_name' => $employee->name,
                'amount' => $this->fromCents($cents),
                'kind' => $kind,
                'period' => $period,
                'creates_advance' => $source !== null,
            ]);

            return $transaction;
        });
    }

    /**
     * Ce que cet employé a RÉELLEMENT reçu, tous portefeuilles confondus.
     *
     * À lire à côté de sa paie, jamais à la place : la paie dit ce qui est dû,
     * ceci dit ce qui est sorti. Les deux peuvent légitimement différer — un
     * mois soldé mais pas encore remis, une avance versée d'avance.
     *
     * @return array<string, mixed>
     */
    public function employeePaymentHistory(Employee $employee): array
    {
        // `toBase()` : les deux sources renvoient des tableaux, pas des
        // modeles. Sans lui, le `merge()` d'une Eloquent\Collection va
        // chercher un getKey() sur chaque ligne et casse.
        $rows = $this->walletPaymentRows($employee)->toBase()
            ->merge($this->caissePaymentRows($employee)->toBase())
            ->sortByDesc('occurred_at')
            ->values();

        $latest = $rows->first();
        $sum = fn (Collection $group) => round((float) $group->sum('amount'), 2);

        return [
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'total_paid' => $sum($rows),
            'wallet_total' => $sum($rows->where('source', self::SOURCE_WALLET)),
            'caisse_total' => $sum($rows->where('source', self::SOURCE_CAISSE)),
            'payments_count' => $rows->count(),
            'last_payment_at' => $latest['occurred_at'] ?? null,
            'last_payment_amount' => $latest['amount'] ?? null,
            'last_payment_source' => $latest['source'] ?? null,
            'by_kind' => $rows->groupBy('kind')
                ->map(fn (Collection $group, string $kind) => [
                    'kind' => $kind,
                    'label' => self::PAYMENT_LABELS[$kind] ?? $kind,
                    'count' => $group->count(),
                    'total' => $sum($group),
                ])
                ->sortByDesc('total')
                ->values()
                ->all(),
            'payments' => $rows->all(),
        ];
    }

    /**
     * Ce qui est sorti d'un portefeuille vers cet employé.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function walletPaymentRows(Employee $employee): Collection
    {
        return WalletTransaction::with(['performedBy', 'wallet.user'])
            ->where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)
            ->where('employee_id', $employee->id)
            ->orderByDesc('occurred_at')
            ->get()
            ->map(function (WalletTransaction $row) {
                $kind = $row->category ?: self::PAYMENT_OTHER;

                return [
                    'id' => 'w-'.$row->id,
                    'source' => self::SOURCE_WALLET,
                    'source_label' => 'Portefeuille',
                    'kind' => $kind,
                    'kind_label' => self::PAYMENT_LABELS[$kind] ?? $kind,
                    'label' => $row->description,
                    'amount' => abs($row->signedAmount()),
                    'occurred_at' => $row->occurred_at?->toIso8601String(),
                    'period' => $row->period,
                    'reference' => $row->reference,
                    'performed_by' => $row->performedBy?->name,
                    'wallet_owner' => $row->wallet?->user?->name,
                    'wallet_transaction_id' => $row->id,
                    'advance_id' => null,
                    'work_day_id' => null,
                    'work_day_date' => null,
                ];
            });
    }

    /**
     * Ce qui est sorti du TIROIR vers cet employé.
     *
     * Toute remise en espèces côté caisse passe par `advances` : l'avance sur
     * salaire classique, et le net d'une paie versée avec « sortie de caisse »
     * (que CommissionPayoutService écrit comme une avance déjà soldée). Les
     * distinguer tient à ce seul marqueur, faute d'un autre signal en base.
     *
     * Les avances d'origine `wallet` sont exclues : elles figurent déjà dans
     * les lignes du portefeuille, et les compter ici les doublerait à l'écran.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function caissePaymentRows(Employee $employee): Collection
    {
        return Advance::caisse()
            ->with('workDay')
            ->where('employee_id', $employee->id)
            ->orderByDesc('given_on')
            ->get()
            ->map(function (Advance $advance) {
                $isCommission = $advance->commission_payout_id !== null
                    && str_starts_with((string) $advance->reason, 'Paiement commission');
                $kind = $isCommission ? self::PAYMENT_COMMISSION : self::PAYMENT_ADVANCE;

                return [
                    'id' => 'c-'.$advance->id,
                    'source' => self::SOURCE_CAISSE,
                    'source_label' => 'Caisse',
                    'kind' => $kind,
                    'kind_label' => self::PAYMENT_LABELS[$kind],
                    'label' => $advance->reason,
                    'amount' => round((float) $advance->amount, 2),
                    'occurred_at' => $advance->given_on?->toIso8601String(),
                    'period' => null,
                    'reference' => null,
                    'performed_by' => null,
                    'wallet_owner' => null,
                    'wallet_transaction_id' => null,
                    'advance_id' => $advance->id,
                    'work_day_id' => $advance->work_day_id,
                    'work_day_date' => $advance->workDay?->date?->toDateString(),
                ];
            });
    }

    /**
     * Ce qu'il faut savoir AVANT de valider un paiement : ce qui est dû pour
     * cette période, ce qui a déjà été versé, et ce qu'il reste.
     *
     * Une honnêteté nécessaire : l'application ne connaît pas de salaire. Elle
     * sait ce qu'un employé a GAGNÉ en commission, rien de plus. Le montant dû
     * n'est donc renseigné que pour un paiement de commission ; pour un
     * salaire ou une prime, l'écran affiche ce qui a déjà été versé sur la
     * période et s'arrête là, plutôt que d'inventer une référence.
     *
     * @return array<string, mixed>
     */
    public function employeePaymentContext(Employee $employee, ?string $period, string $kind): array
    {
        $outstanding = round((float) Advance::where('employee_id', $employee->id)
            ->outstanding()
            ->sum('amount'), 2);

        $context = [
            'employee_id' => $employee->id,
            'employee_name' => $employee->name,
            'kind' => $kind,
            'kind_label' => self::PAYMENT_LABELS[$kind] ?? $kind,
            'period' => $period,
            'has_period' => $period !== null,
            'due_total' => null,
            'due_label' => null,
            'already_paid_total' => 0.0,
            'already_paid_wallet' => 0.0,
            'already_paid_caisse' => 0.0,
            'remaining' => null,
            'advances_outstanding' => $outstanding,
            'payments' => [],
        ];

        if ($period === null) {
            return $context;
        }

        $paidWallet = round((float) WalletTransaction::where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)
            ->where('employee_id', $employee->id)
            ->where('category', $kind)
            ->where('period', $period)
            ->sum('amount'), 2);

        $paidCaisse = 0.0;

        if ($kind === self::PAYMENT_COMMISSION) {
            // Le reste vient de la PAIE, pas d'un calcul local : c'est la
            // seule facon que l'ecran Paie et cet ecran-ci ne puissent jamais
            // annoncer deux montants differents pour le meme employe.
            $preview = $this->payouts->preview($employee, $period);

            $context['due_total'] = $preview['commission_total'];
            $context['due_label'] = 'Commission gagnée';
            $context['already_paid_wallet'] = $preview['paid_from_wallet'];
            $context['already_paid_caisse'] = round(
                $preview['paid_net_total'] + $preview['paid_advances_total'],
                2,
            );
            $context['advances_outstanding'] = $preview['advances_outstanding'];
            $context['already_paid_total'] = round(
                $context['already_paid_wallet'] + $context['already_paid_caisse'],
                2,
            );
            $context['remaining'] = $preview['net_amount'];
            $context['payments'] = $this->periodPayments($employee, $period, $kind);

            return $context;
        }

        if ($kind === self::PAYMENT_ADVANCE) {
            [$from, $to] = $this->periodBounds($period);
            $paidCaisse = round((float) Advance::caisse()
                ->where('employee_id', $employee->id)
                ->whereBetween('given_on', [$from, $to])
                ->sum('amount'), 2);
        }

        $context['already_paid_wallet'] = $paidWallet;
        $context['already_paid_caisse'] = $paidCaisse;
        $context['already_paid_total'] = round($paidWallet + $paidCaisse, 2);
        $context['payments'] = $this->periodPayments($employee, $period, $kind);

        return $context;
    }

    /**
     * Les versements deja enregistres sur cette periode : c'est ce qui rend un
     * doublon visible AVANT de valider, pas apres.
     *
     * @return list<array<string, mixed>>
     */
    private function periodPayments(Employee $employee, string $period, string $kind): array
    {
        return array_values(array_filter(
            $this->employeePaymentHistory($employee)['payments'],
            fn (array $row) => $row['period'] === $period
                || ($kind === self::PAYMENT_COMMISSION
                    && $row['source'] === self::SOURCE_CAISSE
                    && $row['kind'] === self::PAYMENT_COMMISSION),
        ));
    }

    /**
     * Ce qu'il reste à verser à chaque employé pour une période.
     *
     * LA DÉFINITION, parce qu'elle décide de tout le reste :
     *
     *  - « Dû » est la commission GAGNÉE sur le mois. C'est la seule
     *    obligation que l'application connaisse — elle n'enregistre aucun
     *    salaire fixe. Un employé sans commission apparaît donc avec un dû à
     *    zéro, et ce qu'on lui a versé reste visible.
     *
     *  - « Versé » est tout l'argent RÉELLEMENT remis pour ce mois, quelle
     *    qu'en soit la poche : versements du portefeuille portant cette
     *    période, versements du portefeuille non datés d'une période mais
     *    tombant dans le mois, et sorties de caisse (avances, net d'une paie
     *    versée avec sortie de caisse) du mois. Une avance compte : c'est de
     *    l'argent déjà dans la main de l'employé, qui réduit d'autant ce qui
     *    reste à lui donner.
     *
     *  - « Reste » est la différence, jamais négative : verser plus que la
     *    commission est possible et légitime, mais cela ne crée pas une dette
     *    de l'employé — celle-là, ce sont les avances qui la portent, et elles
     *    sont exposées à part.
     *
     * @return array<string, mixed>
     */
    public function employeeDues(string $period): array
    {
        $employees = Employee::query()
            ->where('is_company', false)
            ->where('is_demo', false)
            ->orderBy('name')
            ->get();

        $rows = $employees
            ->map(function (Employee $employee) use ($period) {
                // Tout vient de la PAIE. C'est plus de requetes qu'un agregat
                // maison, et c'est le prix a payer pour que cette liste et
                // l'ecran Paie ne puissent pas annoncer deux restes
                // differents pour le meme employe — ce qu'ils faisaient.
                $preview = $this->payouts->preview($employee, $period);
                $paidPayouts = round(
                    $preview['paid_net_total'] + $preview['paid_advances_total'],
                    2,
                );


                return [
                    'employee_id' => $employee->id,
                    'employee_name' => $employee->name,
                    'avatar_color' => $employee->avatar_color,
                    'is_active' => (bool) $employee->is_active,
                    'due_total' => $preview['commission_total'],
                    // Argent deja remis en main propre depuis un portefeuille.
                    'paid_wallet' => $preview['paid_from_wallet'],
                    // Paies deja enregistrees pour ce mois.
                    'paid_payouts' => $paidPayouts,
                    'paid_total' => round($preview['paid_from_wallet'] + $paidPayouts, 2),
                    // Avances non soldees : pas encore « payees », mais deja
                    // dans la main de l'employe, donc deduites du reste.
                    'advances_outstanding' => $preview['advances_outstanding'],
                    // La ventilation vient de la paie elle-meme : la part du
                    // mois, et le report des mois precedents — celui qui
                    // surprend, parce qu'il se deduit d'un mois ou l'on n'a
                    // rien avance.
                    'advances_in_period' => $preview['advances_in_period'],
                    'advances_carried_over' => $preview['advances_carried_over'],
                    'remaining' => $preview['net_amount'],
                ];
            })
            // Un employe sans commission ni versement sur le mois n'a rien a
            // faire dans une liste de « reste a payer » : il la remplirait
            // sans rien y apporter.
            ->filter(fn (array $row) => $row['due_total'] > 0
                || $row['paid_total'] > 0
                || $row['advances_outstanding'] > 0)
            // Ce qui reste d'abord, puis l'ordre alphabetique : la question
            // posee est « a qui dois-je encore de l'argent ».
            ->sort(fn (array $a, array $b) => [$b['remaining'], $a['employee_name']]
                <=> [$a['remaining'], $b['employee_name']])
            ->values();

        return [
            'period' => $period,
            'totals' => [
                'employees_count' => $rows->count(),
                'employees_remaining' => $rows->where('remaining', '>', 0)->count(),
                'due_total' => round((float) $rows->sum('due_total'), 2),
                'paid_total' => round((float) $rows->sum('paid_total'), 2),
                'paid_wallet_total' => round((float) $rows->sum('paid_wallet'), 2),
                'paid_payouts_total' => round((float) $rows->sum('paid_payouts'), 2),
                'advances_outstanding_total' => round((float) $rows->sum('advances_outstanding'), 2),
                'advances_in_period_total' => round((float) $rows->sum('advances_in_period'), 2),
                'advances_carried_over_total' => round((float) $rows->sum('advances_carried_over'), 2),
                'remaining_total' => round((float) $rows->sum('remaining'), 2),
            ],
            'employees' => $rows->all(),
        ];
    }

    /** @return array{0: string, 1: string} */
    private function periodDateTimes(string $period): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m', $period)->startOfMonth();

        return [
            $start->startOfDay()->toDateTimeString(),
            $start->endOfMonth()->endOfDay()->toDateTimeString(),
        ];
    }

    /** @return array{0: string, 1: string} */
    private function periodBounds(string $period): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m', $period)->startOfMonth();

        return [$start->toDateString(), $start->endOfMonth()->toDateString()];
    }

    /**
     * Refuse un paiement de commission dont l'argent est déjà sorti du tiroir.
     *
     * `CommissionPayoutService::pay($deductFromCaisse: true)` enregistre le net
     * versé comme une avance soldée sur la journée ouverte : ce montant a donc
     * déjà réduit le résultat de la journée, donc déjà réduit le crédit reçu
     * par ce portefeuille. Le repayer ici sortirait le même argent deux fois.
     */
    private function assertCommissionNotAlreadyPaidFromCaisse(Employee $employee, string $period): void
    {
        $exists = Advance::caisse()
            ->where('employee_id', $employee->id)
            ->whereNotNull('work_day_id')
            ->whereNotNull('commission_payout_id')
            ->whereHas('commissionPayout', fn ($query) => $query->where('period', $period))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'amount' => sprintf(
                    'La commission de %s est déjà sortie de la caisse pour cet employé : la repayer ici compterait le même argent deux fois.',
                    $period,
                ),
            ]);
        }
    }

    /** Le même garde-fou que pour les transferts, appliqué au double appui. */
    private function assertNotAnImmediateDuplicatePayment(
        Wallet $wallet,
        Employee $employee,
        string $kind,
        int $cents,
    ): void {
        $exists = WalletTransaction::where('wallet_id', $wallet->id)
            ->where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT)
            ->where('employee_id', $employee->id)
            ->where('category', $kind)
            ->where('amount', $this->fromCents($cents))
            ->where('created_at', '>=', now()->subMinute())
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'amount' => 'Un paiement identique vient d\'être enregistré pour cet employé. Confirmez pour en enregistrer un second.',
            ]);
        }
    }

    /**
     * Avertit quand le montant dépasse ce qui reste dû sur la période.
     *
     * Un AVERTISSEMENT, pas un interdit : verser plus que la commission du
     * mois est parfois légitime (un rattrapage, une régularisation), et le
     * métier doit pouvoir le faire. Mais jamais sans le savoir — d'où la
     * confirmation explicite plutôt qu'un passage silencieux.
     *
     * Ne se déclenche que là où l'application connaît réellement un montant
     * dû, c'est-à-dire sur la commission. Elle n'a aucune notion de salaire.
     */
    private function assertNotOverDue(Employee $employee, string $kind, ?string $period, int $cents): void
    {
        if ($period === null) {
            return;
        }

        $context = $this->employeePaymentContext($employee, $period, $kind);

        if ($context['remaining'] === null || $cents <= $this->toCents((float) $context['remaining'])) {
            return;
        }

        throw ValidationException::withMessages([
            'amount' => sprintf(
                'Il ne reste que %s DH à verser sur la commission de %s (%s DH déjà versés sur %s DH gagnés). Confirmez pour verser davantage.',
                number_format((float) $context['remaining'], 2, ',', ' '),
                $period,
                number_format((float) $context['already_paid_total'], 2, ',', ' '),
                number_format((float) $context['due_total'], 2, ',', ' '),
            ),
        ]);
    }

    private function paymentLabel(string $kind, ?string $period): string
    {
        $label = self::PAYMENT_LABELS[$kind] ?? self::PAYMENT_LABELS[self::PAYMENT_OTHER];

        return $period === null ? $label : $label.' '.$period;
    }

    // =========================================================================
    // 4. Fond de caisse
    // =========================================================================

    /**
     * Met une partie du disponible de côté comme fond de caisse.
     *
     * L'argent ne quitte pas le portefeuille : il change de poche. C'est
     * précisément ce que la séparation `balance` / `cash_fund_balance` rend
     * impossible à confondre avec une remise au patron.
     */
    public function allocateCashFund(Wallet $wallet, float $amount, User $actor, ?string $description = null): WalletTransaction
    {
        $cents = $this->positiveCents($amount);

        return DB::transaction(function () use ($wallet, $cents, $actor, $description) {
            $locked = $this->lock($wallet);

            $this->assertAvailable($locked, $cents);

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_CASH_FUND,
                'cents' => -$cents,
                'bucket' => WalletTransaction::BUCKET_CASH_FUND,
                'performed_by_user_id' => $actor->id,
                'description' => $description ?: 'Affectation au fond de caisse',
            ]);

            $this->activityLogger->log('wallet.cash_fund', $transaction, [], [
                'wallet_id' => $locked->id,
                'amount' => $this->fromCents($cents),
            ]);

            return $transaction;
        });
    }

    /** Réintègre tout ou partie du fond de caisse dans le disponible. */
    public function returnCashFund(Wallet $wallet, float $amount, User $actor, ?string $description = null): WalletTransaction
    {
        $cents = $this->positiveCents($amount);

        return DB::transaction(function () use ($wallet, $cents, $actor, $description) {
            $locked = $this->lock($wallet);

            if ($this->toCents((float) $locked->cash_fund_balance) < $cents) {
                throw ValidationException::withMessages([
                    'amount' => sprintf(
                        'Fond de caisse insuffisant : %s DH disponibles.',
                        number_format((float) $locked->cash_fund_balance, 2, ',', ' '),
                    ),
                ]);
            }

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_CASH_FUND_RETURN,
                'cents' => $cents,
                'bucket' => WalletTransaction::BUCKET_CASH_FUND,
                'performed_by_user_id' => $actor->id,
                'description' => $description ?: 'Reprise du fond de caisse',
            ]);

            $this->activityLogger->log('wallet.cash_fund_return', $transaction, [], [
                'wallet_id' => $locked->id,
                'amount' => $this->fromCents($cents),
            ]);

            return $transaction;
        });
    }

    // =========================================================================
    // 5. Corrections traçables
    // =========================================================================

    /**
     * Ajustement libre, réservé au Super Admin (voir la permission
     * `wallet.adjust`). Montant signé : positif pour ajouter, négatif pour
     * retirer.
     */
    public function adjust(
        Wallet $wallet,
        float $signedAmount,
        string $reason,
        User $actor,
        string $bucket = WalletTransaction::BUCKET_AVAILABLE,
    ): WalletTransaction {
        $cents = $this->toCents($signedAmount);

        if ($cents === 0) {
            throw ValidationException::withMessages([
                'amount' => 'Un ajustement de 0 DH ne corrige rien.',
            ]);
        }

        return DB::transaction(function () use ($wallet, $cents, $reason, $actor, $bucket) {
            $locked = $this->lock($wallet);

            $transaction = $this->write($locked, [
                'type' => WalletTransaction::TYPE_ADJUSTMENT,
                'cents' => $cents,
                'bucket' => $bucket,
                'performed_by_user_id' => $actor->id,
                'description' => $reason,
            ]);

            $this->activityLogger->log('wallet.adjustment', $transaction, [], [
                'wallet_id' => $locked->id,
                'amount' => $this->fromCents($cents),
                'reason' => $reason,
            ]);

            return $transaction;
        });
    }

    /**
     * Contre-passe un mouvement : une écriture inverse, liée à l'originale.
     *
     * Jamais une suppression. Les deux lignes restent visibles, et l'historique
     * raconte l'erreur autant que sa correction.
     *
     * Une jambe de transfert ne se contre-passe pas seule — les deux le sont
     * ensemble, sinon les deux portefeuilles cesseraient de s'accorder.
     *
     * @return list<WalletTransaction>
     */
    public function reverse(WalletTransaction $transaction, User $actor, ?string $reason = null): array
    {
        $legs = $transaction->transfer_group !== null
            ? WalletTransaction::where('transfer_group', $transaction->transfer_group)->orderBy('id')->get()
            : collect([$transaction]);

        foreach ($legs as $leg) {
            if (WalletTransaction::where('reverses_transaction_id', $leg->id)->exists()) {
                throw ValidationException::withMessages([
                    'transaction' => 'Ce mouvement a déjà été contre-passé.',
                ]);
            }
        }

        $label = $reason ?: 'Correction';

        return DB::transaction(function () use ($legs, $actor, $label) {
            $reversals = [];

            foreach ($legs as $leg) {
                $wallet = $this->lock($leg->wallet);

                $reversals[] = $this->write($wallet, [
                    'type' => WalletTransaction::TYPE_ADJUSTMENT,
                    'cents' => -$this->toCents($leg->signedAmount()),
                    'bucket' => $leg->bucket,
                    'counterparty_wallet_id' => $leg->counterparty_wallet_id,
                    'reverses_transaction_id' => $leg->id,
                    'performed_by_user_id' => $actor->id,
                    // La contre-passe d'un résultat de caisse reste de
                    // l'argent de la caisse : le marqueur suit, pour que le
                    // compteur « Résultats de caisse reçus » rende la journée
                    // quand son crédit est annulé ou réattribué — sans lui,
                    // elle resterait comptée ici ET là où elle repart.
                    'category' => $leg->isCashRegisterFlow()
                        ? WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION
                        : null,
                    'description' => $label.' — annulation du mouvement #'.$leg->id,
                ]);

                $this->activityLogger->log('wallet.reversal', $leg, [], [
                    'wallet_id' => $wallet->id,
                    'amount' => -$leg->signedAmount(),
                    'reason' => $label,
                ]);
            }

            return $reversals;
        });
    }

    /**
     * Réattribue le résultat d'une journée de caisse au bon portefeuille.
     *
     * Le crédit mal placé est contre-passé chez son détenteur, et un
     * AJUSTEMENT du même montant est écrit chez le destinataire — les deux
     * dans LA MÊME transaction : il ne peut pas exister d'état où l'argent a
     * quitté un portefeuille sans être arrivé dans l'autre, ce que
     * permettaient deux appels séparés à `reverse()` puis `adjust()`.
     *
     * Les deux écritures portent `category = cash_register_correction`, et le
     * crédit de réattribution pointe la journée (`source`). C'est ce qui
     * distingue une réattribution d'un ajustement manuel ordinaire : elle
     * reste comptée dans « Résultats de caisse reçus » — chez celui qui rend
     * en moins, chez celui qui reçoit en plus, donc UNE seule fois dans tout
     * le système — quand l'ajustement libre n'y entre jamais.
     *
     * Le lien avec la journée sert aussi de verrou anti-double-comptage :
     * l'index unique `wallet_tx_source_unique` interdit une seconde
     * réattribution de la même journée, exactement comme il interdit son
     * second crédit initial. Et comme la contre-passe refuse un mouvement
     * déjà contre-passé, rejouer la réattribution échoue proprement.
     *
     * @return array{reversal: WalletTransaction, credit: WalletTransaction}
     */
    public function reattributeWorkDayResult(
        WalletTransaction $credit,
        User $target,
        User $actor,
        ?string $context = null,
    ): array {
        if ($credit->type !== WalletTransaction::TYPE_CASH_REGISTER_RESULT) {
            throw ValidationException::withMessages([
                'transaction' => 'Seul un résultat de caisse peut être réattribué.',
            ]);
        }

        $day = $credit->source;

        if (! $day instanceof WorkDay) {
            throw ValidationException::withMessages([
                'transaction' => 'Ce mouvement n\'est lié à aucune journée de caisse.',
            ]);
        }

        $destination = $this->walletFor($target);

        if ($destination->id === $credit->wallet_id) {
            throw ValidationException::withMessages([
                'transaction' => 'Le résultat de cette journée est déjà dans ce portefeuille.',
            ]);
        }

        $label = 'Réattribution du résultat de caisse du '.CarbonImmutable::parse($day->date)->format('d/m/Y');

        try {
            return DB::transaction(function () use ($credit, $destination, $actor, $day, $label, $context) {
                [$reversal] = $this->reverse($credit, $actor, $label);

                $locked = $this->lock($destination);

                $adjustment = $this->write($locked, [
                    'type' => WalletTransaction::TYPE_ADJUSTMENT,
                    'cents' => $this->toCents($credit->signedAmount()),
                    'bucket' => WalletTransaction::BUCKET_AVAILABLE,
                    'source' => $day,
                    'category' => WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION,
                    'performed_by_user_id' => $actor->id,
                    'description' => $context === null ? $label : $label.' — '.$context,
                    // La date métier reste celle de la journée, comme sur le
                    // crédit remplacé : le mouvement se classe dans le bon mois.
                    'occurred_at' => CarbonImmutable::parse($day->date)->startOfDay(),
                ]);

                $this->activityLogger->log('wallet.reattribution', $adjustment, [], [
                    'work_day_id' => $day->id,
                    'from_wallet_id' => $credit->wallet_id,
                    'to_wallet_id' => $locked->id,
                    'amount' => $credit->signedAmount(),
                ]);

                return ['reversal' => $reversal, 'credit' => $adjustment];
            });
        } catch (QueryException $exception) {
            // L'index unique (source, type) a tranché une course : cette
            // journée est déjà réattribuée, la compter deux fois est refusé.
            if ($this->isUniqueViolation($exception)) {
                throw ValidationException::withMessages([
                    'transaction' => 'Le résultat de cette journée a déjà été réattribué.',
                ]);
            }

            throw $exception;
        }
    }

    // =========================================================================
    // 6. Lectures
    // =========================================================================

    /**
     * Tout ce qu'affiche l'entête de la page Wallet, en une requête d'agrégat.
     *
     * @return array<string, mixed>
     */
    public function summary(Wallet $wallet): array
    {
        // `category` entre dans le GROUP BY pour séparer, parmi les
        // ajustements, les corrections de résultats de caisse des ajustements
        // ordinaires : les premières comptent avec la caisse, jamais les
        // seconds.
        $rows = WalletTransaction::where('wallet_id', $wallet->id)
            ->selectRaw('type, direction, category, SUM(amount) as total, COUNT(*) as count')
            ->groupBy('type', 'direction', 'category')
            ->get();

        $sumWhere = fn (callable $match): float => round((float) $rows->filter($match)->sum('total'), 2);

        $sum = fn (string $type, string $direction): float => $sumWhere(
            fn ($row) => $row->type === $type && $row->direction === $direction,
        );

        $isCashCorrection = fn ($row): bool => $row->type === WalletTransaction::TYPE_ADJUSTMENT
            && $row->category === WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION;

        $cashRegisterIn = $sum(WalletTransaction::TYPE_CASH_REGISTER_RESULT, WalletTransaction::DIRECTION_IN);
        $cashRegisterOut = $sum(WalletTransaction::TYPE_CASH_REGISTER_RESULT, WalletTransaction::DIRECTION_OUT);
        $correctionsIn = $sumWhere(fn ($row) => $isCashCorrection($row)
            && $row->direction === WalletTransaction::DIRECTION_IN);
        $correctionsOut = $sumWhere(fn ($row) => $isCashCorrection($row)
            && $row->direction === WalletTransaction::DIRECTION_OUT);
        $adjustmentsIn = $sumWhere(fn ($row) => $row->type === WalletTransaction::TYPE_ADJUSTMENT
            && ! $isCashCorrection($row)
            && $row->direction === WalletTransaction::DIRECTION_IN);
        $adjustmentsOut = $sumWhere(fn ($row) => $row->type === WalletTransaction::TYPE_ADJUSTMENT
            && ! $isCashCorrection($row)
            && $row->direction === WalletTransaction::DIRECTION_OUT);

        return [
            'balance' => round((float) $wallet->balance, 2),
            'cash_fund_balance' => round((float) $wallet->cash_fund_balance, 2),
            'total_held' => $wallet->totalHeld(),
            // Tout l'argent venu de la caisse : les crédits de clôture (net
            // des journées déficitaires, écrites au débit) PLUS les
            // corrections marquées — la réattribution d'un crédit mal placé
            // et sa contre-passe. Une journée réattribuée compte ainsi une
            // seule fois dans tout le système : en moins chez celui qui rend,
            // en plus chez celui qui reçoit.
            'cash_registers_total' => round(
                $cashRegisterIn - $cashRegisterOut + $correctionsIn - $correctionsOut,
                2,
            ),
            'transfers_sent_total' => $sum(WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN, WalletTransaction::DIRECTION_OUT),
            'transfers_received_total' => $sum(WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN, WalletTransaction::DIRECTION_IN),
            // Argent injecté de l'extérieur par le patron. Sur un portefeuille
            // d'admin il vaut toujours 0 : seul le patron peut en faire.
            'owner_deposits_total' => $sum(WalletTransaction::TYPE_OWNER_DEPOSIT, WalletTransaction::DIRECTION_IN),
            // Le chemin descendant, dans les deux sens de lecture.
            'sent_to_admins_total' => $sum(WalletTransaction::TYPE_TRANSFER_TO_ADMIN, WalletTransaction::DIRECTION_OUT),
            'received_from_super_admin_total' => $sum(WalletTransaction::TYPE_TRANSFER_TO_ADMIN, WalletTransaction::DIRECTION_IN),
            'employee_payments_total' => $sum(WalletTransaction::TYPE_EMPLOYEE_PAYMENT, WalletTransaction::DIRECTION_OUT),
            'expenses_total' => $sum(WalletTransaction::TYPE_EXPENSE, WalletTransaction::DIRECTION_OUT),
            'cash_fund_allocated_total' => $sum(WalletTransaction::TYPE_CASH_FUND, WalletTransaction::DIRECTION_OUT),
            'cash_fund_returned_total' => $sum(WalletTransaction::TYPE_CASH_FUND_RETURN, WalletTransaction::DIRECTION_IN),
            // Les ajustements ORDINAIRES seulement : une correction de
            // résultat de caisse est déjà comptée ci-dessus, et l'y laisser
            // compterait le même argent deux fois.
            'adjustments_total' => round($adjustmentsIn - $adjustmentsOut, 2),
            'movements_count' => (int) $rows->sum('count'),
            'start_date' => $this->startDate()->toDateString(),
        ];
    }

    /**
     * Vérifie que les soldes matérialisés correspondent EXACTEMENT à la somme
     * des mouvements. C'est la réponse mécanique à « est-ce que les totaux
     * correspondent aux mouvements enregistrés ? ».
     *
     * @return array<string, mixed>
     */
    public function reconcile(Wallet $wallet): array
    {
        $movements = WalletTransaction::where('wallet_id', $wallet->id)->get([
            'direction', 'bucket', 'amount',
        ]);

        $available = 0;
        $cashFund = 0;

        foreach ($movements as $movement) {
            $cents = $this->toCents((float) $movement->amount);
            $signed = $movement->direction === WalletTransaction::DIRECTION_IN ? $cents : -$cents;

            if ($movement->bucket === WalletTransaction::BUCKET_CASH_FUND) {
                // Le fond de caisse est l'exact miroir du disponible : ce qui
                // sort de l'un entre dans l'autre.
                $available += $signed;
                $cashFund -= $signed;

                continue;
            }

            $available += $signed;
        }

        $expectedBalance = $this->fromCents($available);
        $expectedCashFund = $this->fromCents($cashFund);

        return [
            'wallet_id' => $wallet->id,
            'balance' => round((float) $wallet->balance, 2),
            'computed_balance' => (float) $expectedBalance,
            'cash_fund_balance' => round((float) $wallet->cash_fund_balance, 2),
            'computed_cash_fund_balance' => (float) $expectedCashFund,
            'balanced' => $this->toCents((float) $wallet->balance) === $available
                && $this->toCents((float) $wallet->cash_fund_balance) === $cashFund,
        ];
    }

    /**
     * La vue financière globale du Super Admin.
     *
     * @return array<string, mixed>
     */
    public function overview(): array
    {
        $wallets = Wallet::with('user')->orderBy('type')->orderBy('id')->get();
        $superAdminWallets = $wallets->where('type', Wallet::TYPE_SUPER_ADMIN);
        $adminWallets = $wallets->where('type', Wallet::TYPE_ADMIN);

        $today = CarbonImmutable::today();
        $monthStart = $today->startOfMonth();

        $receivedQuery = fn () => WalletTransaction::whereIn('wallet_id', $superAdminWallets->pluck('id'))
            ->where('type', WalletTransaction::TYPE_TRANSFER_TO_SUPER_ADMIN)
            ->where('direction', WalletTransaction::DIRECTION_IN);

        $rows = $wallets->map(function (Wallet $wallet) {
            $summary = $this->summary($wallet);

            return [
                'wallet_id' => $wallet->id,
                'user_id' => $wallet->user_id,
                'user_name' => $wallet->user->name ?? 'Compte supprimé',
                'type' => $wallet->type,
                'is_active' => (bool) $wallet->is_active,
                'balance' => $summary['balance'],
                'cash_fund_balance' => $summary['cash_fund_balance'],
                'total_held' => $summary['total_held'],
                'cash_registers_total' => $summary['cash_registers_total'],
                'transfers_sent_total' => $summary['transfers_sent_total'],
                'transfers_received_total' => $summary['transfers_received_total'],
                'owner_deposits_total' => $summary['owner_deposits_total'],
                'sent_to_admins_total' => $summary['sent_to_admins_total'],
                'received_from_super_admin_total' => $summary['received_from_super_admin_total'],
                'employee_payments_total' => $summary['employee_payments_total'],
                'expenses_total' => $summary['expenses_total'],
                'movements_count' => $summary['movements_count'],
            ];
        })->values();

        $adminRows = $rows->where('type', Wallet::TYPE_ADMIN)->values();
        $superAdminRows = $rows->where('type', Wallet::TYPE_SUPER_ADMIN)->values();

        return [
            'start_date' => $this->startDate()->toDateString(),
            'super_admin' => [
                'wallet_id' => $this->superAdminWallet()?->id,
                'balance' => round((float) $superAdminWallets->sum(fn (Wallet $w) => (float) $w->balance), 2),
                'cash_fund_balance' => round((float) $superAdminWallets->sum(fn (Wallet $w) => (float) $w->cash_fund_balance), 2),
                'received_total' => round((float) $receivedQuery()->sum('amount'), 2),
                'received_today' => round((float) $receivedQuery()->whereDate('created_at', $today->toDateString())->sum('amount'), 2),
                'received_month' => round((float) $receivedQuery()->where('created_at', '>=', $monthStart)->sum('amount'), 2),
                // « Combien le patron a-t-il injecté lui-même ? » — distinct de
                // ce qu'il a reçu des admins, et c'est tout l'intérêt.
                'deposits_total' => round((float) $superAdminRows->sum('owner_deposits_total'), 2),
                'sent_to_admins_total' => round((float) $superAdminRows->sum('sent_to_admins_total'), 2),
            ],
            'admins' => [
                'count' => $adminRows->count(),
                'balance_total' => round((float) $adminRows->sum('balance'), 2),
                'cash_fund_total' => round((float) $adminRows->sum('cash_fund_balance'), 2),
                'expenses_total' => round((float) $adminRows->sum('expenses_total'), 2),
                'cash_registers_total' => round((float) $adminRows->sum('cash_registers_total'), 2),
                'transfers_sent_total' => round((float) $adminRows->sum('transfers_sent_total'), 2),
                'received_from_super_admin_total' => round((float) $adminRows->sum('received_from_super_admin_total'), 2),
                'employee_payments_total' => round((float) $adminRows->sum('employee_payments_total'), 2),
            ],
            'expenses_total' => round((float) $rows->sum('expenses_total'), 2),
            'employee_payments_total' => round((float) $rows->sum('employee_payments_total'), 2),
            'cash_fund_total' => round((float) $rows->sum('cash_fund_balance'), 2),
            'wallets' => $rows->all(),
        ];
    }

    /**
     * L'historique filtrable d'un portefeuille.
     *
     * @param  array<string, mixed>  $filters
     */
    public function transactions(Wallet $wallet, array $filters = []): Collection
    {
        $query = WalletTransaction::with(['performedBy', 'counterpartyWallet.user', 'employee', 'source'])
            ->where('wallet_id', $wallet->id);

        if (! empty($filters['from'])) {
            $query->whereDate('occurred_at', '>=', CarbonImmutable::parse($filters['from'])->toDateString());
        }
        if (! empty($filters['to'])) {
            $query->whereDate('occurred_at', '<=', CarbonImmutable::parse($filters['to'])->toDateString());
        }
        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }
        if (! empty($filters['direction'])) {
            $query->where('direction', $filters['direction']);
        }
        if (isset($filters['min_amount']) && $filters['min_amount'] !== null && $filters['min_amount'] !== '') {
            $query->where('amount', '>=', (float) $filters['min_amount']);
        }
        if (isset($filters['max_amount']) && $filters['max_amount'] !== null && $filters['max_amount'] !== '') {
            $query->where('amount', '<=', (float) $filters['max_amount']);
        }
        if (! empty($filters['user_id'])) {
            $query->where('performed_by_user_id', (int) $filters['user_id']);
        }
        if (! empty($filters['employee_id'])) {
            $query->where('employee_id', (int) $filters['employee_id']);
        }
        if (! empty($filters['category'])) {
            $query->where('category', $filters['category']);
        }
        if (! empty($filters['work_day_id'])) {
            $query->where('source_type', (new WorkDay)->getMorphClass())
                ->where('source_id', (int) $filters['work_day_id']);
        }

        return $query->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit((int) ($filters['limit'] ?? 200))
            ->get();
    }

    // =========================================================================
    // Écriture bas niveau
    // =========================================================================

    /**
     * L'unique porte d'écriture du ledger : elle applique le mouvement aux
     * soldes ET écrit la ligne, dans cet ordre, sous le verrou du portefeuille.
     * Toute autre façon d'ajouter de l'argent au système serait une erreur.
     *
     * `cents` est SIGNÉ et se lit toujours du point de vue du DISPONIBLE :
     * négatif = le disponible baisse. Pour un mouvement de fond de caisse, la
     * poche opposée bouge en miroir dans le même geste.
     *
     * @param  array<string, mixed>  $data
     */
    private function write(Wallet $wallet, array $data): WalletTransaction
    {
        $cents = (int) $data['cents'];
        $bucket = $data['bucket'] ?? WalletTransaction::BUCKET_AVAILABLE;

        $balanceCents = $this->toCents((float) $wallet->balance) + $cents;
        $cashFundCents = $this->toCents((float) $wallet->cash_fund_balance)
            + ($bucket === WalletTransaction::BUCKET_CASH_FUND ? -$cents : 0);

        $wallet->forceFill([
            'balance' => $this->fromCents($balanceCents),
            'cash_fund_balance' => $this->fromCents($cashFundCents),
        ])->save();

        /** @var \Illuminate\Database\Eloquent\Model|null $source */
        $source = $data['source'] ?? null;

        return WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'counterparty_wallet_id' => $data['counterparty_wallet_id'] ?? null,
            'transfer_group' => $data['transfer_group'] ?? null,
            'type' => $data['type'],
            'direction' => $cents >= 0 ? WalletTransaction::DIRECTION_IN : WalletTransaction::DIRECTION_OUT,
            'bucket' => $bucket,
            'amount' => $this->fromCents(abs($cents)),
            'balance_after' => $this->fromCents($balanceCents),
            'cash_fund_after' => $this->fromCents($cashFundCents),
            'performed_by_user_id' => $data['performed_by_user_id'] ?? null,
            // Renseignes uniquement par les paiements d'employes ; ils ne
            // veulent rien dire sur un resultat de caisse ou une remise.
            'employee_id' => $data['employee_id'] ?? null,
            'period' => $data['period'] ?? null,
            'source_type' => $source?->getMorphClass(),
            'source_id' => $source?->getKey(),
            'reverses_transaction_id' => $data['reverses_transaction_id'] ?? null,
            'category' => $data['category'] ?? null,
            'reference' => $data['reference'] ?? null,
            'description' => $data['description'] ?? null,
            'occurred_at' => $data['occurred_at'] ?? now(),
        ]);
    }

    private function lock(Wallet $wallet): Wallet
    {
        return Wallet::whereKey($wallet->getKey())->lockForUpdate()->firstOrFail();
    }

    /**
     * Verrouille deux portefeuilles dans l'ordre de leurs identifiants, pour
     * que deux transferts croisés s'attendent au lieu de s'interbloquer.
     *
     * @return array{0: Wallet, 1: Wallet}
     */
    private function lockPair(Wallet $from, Wallet $to): array
    {
        $ids = [$from->getKey(), $to->getKey()];
        sort($ids);

        $locked = Wallet::whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');

        return [$locked[$from->getKey()], $locked[$to->getKey()]];
    }

    /** Interdit tout retrait supérieur au disponible. */
    private function assertAvailable(Wallet $wallet, int $cents): void
    {
        if ($this->toCents((float) $wallet->balance) < $cents) {
            throw ValidationException::withMessages([
                'amount' => sprintf(
                    'Solde insuffisant : %s DH disponibles dans le portefeuille.',
                    number_format((float) $wallet->balance, 2, ',', ' '),
                ),
            ]);
        }
    }

    private function positiveCents(float $amount): int
    {
        $cents = $this->toCents($amount);

        if ($cents <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'Le montant doit être supérieur à 0.',
            ]);
        }

        return $cents;
    }

    private function toCents(float $amount): int
    {
        return (int) round($amount * 100);
    }

    private function fromCents(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    private function isUniqueViolation(QueryException $exception): bool
    {
        // 23000 couvre MySQL/MariaDB et SQLite, 23505 PostgreSQL.
        return in_array((string) ($exception->errorInfo[0] ?? ''), ['23000', '23505'], true);
    }
}
