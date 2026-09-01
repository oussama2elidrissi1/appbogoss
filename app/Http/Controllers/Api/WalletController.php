<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WalletResource;
use App\Http\Resources\WalletTransactionResource;
use App\Models\Employee;
use App\Models\WalletTransaction;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Le portefeuille de l'utilisateur connecté.
 *
 * Aucune de ces routes ne prend d'identifiant de portefeuille : elles
 * travaillent toujours sur celui du demandeur. Un admin ne peut donc pas
 * dépenser depuis le portefeuille d'un autre, même en forgeant sa requête —
 * il n'y a pas de paramètre à forger. Voir WalletAdminController pour la
 * lecture transversale, réservée au Super Admin.
 */
class WalletController extends Controller
{
    public function __construct(private readonly WalletService $wallets)
    {
    }

    /** Solde, compteurs et réconciliation du portefeuille du demandeur. */
    public function show(Request $request): JsonResponse
    {
        $wallet = $this->wallets->walletFor($request->user());

        return response()->json([
            'data' => new WalletResource($wallet->load('user')),
        ]);
    }

    /**
     * L'historique, filtrable par période, type, montant, journée de caisse et
     * utilisateur — les cinq filtres demandés par l'écran.
     */
    public function transactions(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'type' => ['nullable', Rule::in(WalletTransaction::TYPES)],
            'direction' => ['nullable', Rule::in(['in', 'out'])],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'max_amount' => ['nullable', 'numeric', 'min:0'],
            'work_day_id' => ['nullable', 'integer', 'exists:work_days,id'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        return response()->json([
            'data' => WalletTransactionResource::collection(
                $this->wallets->transactions($wallet, $filters),
            ),
        ]);
    }

    /**
     * « Envoyer au Super Admin ».
     *
     * Débit ici, crédit là-bas, une seule transaction. Le montant est plafonné
     * au disponible côté service — la validation ci-dessous ne fait que
     * refuser les valeurs absurdes avant d'y arriver.
     */
    public function transfer(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            // Confirme un second envoi identique dans la minute, que le
            // service refuse par défaut pour parer au double appui.
            'allow_duplicate' => ['nullable', 'boolean'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        $legs = $this->wallets->transferToSuperAdmin(
            $wallet,
            (float) $validated['amount'],
            $request->user(),
            $validated['description'] ?? null,
            $validated['reference'] ?? null,
            (bool) ($validated['allow_duplicate'] ?? false),
        );

        return response()->json([
            'data' => new WalletTransactionResource($legs['out']->load('counterpartyWallet.user')),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /**
     * Paie un employé sur l'argent détenu.
     *
     * Ce que cette route enregistre est un MOUVEMENT d'argent, pas une
     * obligation : les commissions et la paie mensuelle continuent de dire ce
     * qui est dû, exactement comme avant. Rien n'est écrit dans la caisse, donc
     * le résultat des journées ne bouge pas d'un centime.
     *
     * `acknowledge_duplicate` lève deux refus volontaires : le double appui, et
     * le paiement d'une commission dont l'argent est déjà sorti du tiroir.
     */
    public function payEmployee(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'kind' => ['required', Rule::in(WalletService::PAYMENT_KINDS)],
            // Le mois que ce paiement solde — une etiquette, pas la date du
            // mouvement : on paie en septembre un salaire d'aout.
            'period' => ['nullable', 'date_format:Y-m'],
            'note' => ['nullable', 'string', 'max:1000'],
            'reference' => ['nullable', 'string', 'max:255'],
            'acknowledge_duplicate' => ['nullable', 'boolean'],
            // Confirme un versement superieur a ce qui reste du sur la periode.
            // Distinct du doublon : ce sont deux decisions differentes.
            'acknowledge_over_due' => ['nullable', 'boolean'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());
        $employee = Employee::findOrFail($validated['employee_id']);

        $transaction = $this->wallets->payEmployee(
            $wallet,
            $employee,
            [
                'amount' => (float) $validated['amount'],
                'kind' => $validated['kind'],
                'period' => $validated['period'] ?? null,
                'note' => $validated['note'] ?? null,
                'reference' => $validated['reference'] ?? null,
            ],
            $request->user(),
            (bool) ($validated['acknowledge_duplicate'] ?? false),
            (bool) ($validated['acknowledge_over_due'] ?? false),
        );

        return response()->json([
            'data' => new WalletTransactionResource($transaction->load(['employee', 'source'])),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /**
     * Tout ce qu'un employé a réellement reçu — portefeuille ET caisse.
     *
     * Chaque ligne porte sa source, parce que c'est la seule question qui
     * compte quand on relit un paiement : d'où est sorti cet argent. À lire à
     * côté de sa paie, jamais à la place — « total payé » ici est de l'argent
     * sorti, là-bas c'est de l'argent dû.
     */
    public function employeePayments(Employee $employee): JsonResponse
    {
        return response()->json([
            'data' => $this->wallets->employeePaymentHistory($employee),
        ]);
    }

    /**
     * Qui reste à payer, pour un mois donné.
     *
     * Une seule liste, triée par ce qui reste : c'est la réponse à « à qui
     * dois-je encore de l'argent ce mois-ci ? », sans avoir à ouvrir chaque
     * fiche l'une après l'autre.
     */
    public function employeeDues(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
        ]);

        return response()->json([
            'data' => $this->wallets->employeeDues(
                $validated['period'] ?? now()->format('Y-m'),
            ),
        ]);
    }

    /**
     * Ce qu'il faut savoir avant de valider : dû, déjà versé, reste.
     *
     * Interrogé par la modale de paiement à chaque changement d'employé, de
     * période ou de motif. Le montant dû n'existe que pour une commission :
     * l'application ne connaît pas de salaire, et l'écran le dit plutôt que
     * d'afficher une référence inventée.
     */
    public function employeePaymentContext(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
            'kind' => ['required', Rule::in(WalletService::PAYMENT_KINDS)],
        ]);

        return response()->json([
            'data' => $this->wallets->employeePaymentContext(
                $employee,
                $validated['period'] ?? null,
                $validated['kind'],
            ),
        ]);
    }

    /** Une dépense payée sur l'argent détenu. Débite le portefeuille. */
    public function storeExpense(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'label' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'spent_on' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'reference' => ['nullable', 'string', 'max:255'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        $transaction = $this->wallets->recordExpense($wallet, [
            'amount' => (float) $validated['amount'],
            'label' => $validated['label'],
            'category' => $validated['category'] ?? 'general',
            'spent_on' => $validated['spent_on'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'reference' => $validated['reference'] ?? null,
        ], $request->user());

        return response()->json([
            'data' => new WalletTransactionResource($transaction->load('source')),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /**
     * Affecte une partie du disponible au fond de caisse.
     *
     * L'argent ne quitte pas le portefeuille : il change de poche. Ce n'est
     * surtout pas une remise au patron, et les deux soldes restent distincts.
     */
    public function allocateCashFund(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        $transaction = $this->wallets->allocateCashFund(
            $wallet,
            (float) $validated['amount'],
            $request->user(),
            $validated['description'] ?? null,
        );

        return response()->json([
            'data' => new WalletTransactionResource($transaction),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /** Réintègre tout ou partie du fond de caisse dans le disponible. */
    public function returnCashFund(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        $transaction = $this->wallets->returnCashFund(
            $wallet,
            (float) $validated['amount'],
            $request->user(),
            $validated['description'] ?? null,
        );

        return response()->json([
            'data' => new WalletTransactionResource($transaction),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }
}
