<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WalletResource;
use App\Http\Resources\WalletTransactionResource;
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
