<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WalletResource;
use App\Http\Resources\WalletTransactionResource;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * La vue financière globale — réservée au Super Admin.
 *
 * Elle répond aux questions que personne ne devrait avoir à calculer à la
 * main : combien d'argent est encore chez chaque admin, combien est arrivé
 * chez le patron (au total, aujourd'hui, ce mois-ci), combien dort en fond de
 * caisse, combien est parti en dépenses, et d'où vient chaque montant.
 *
 * Rien n'est recalculé ici : tout vient de WalletService, donc de la même
 * source que l'écran de l'admin. Les deux ne peuvent pas se contredire.
 */
class WalletAdminController extends Controller
{
    public function __construct(private readonly WalletService $wallets)
    {
    }

    /**
     * « Charger mon portefeuille » — l'apport du patron.
     *
     * De l'argent qui entre dans le système sans venir d'une journée de caisse
     * ni d'un autre portefeuille. C'est le seul geste de ce genre, il est
     * réservé au Super Admin (`wallet.deposit`), et le motif est obligatoire.
     */
    public function deposit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reason' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $wallet = $this->wallets->walletFor($request->user());

        $transaction = $this->wallets->deposit(
            $wallet,
            (float) $validated['amount'],
            $validated['reason'],
            $request->user(),
            $validated['reference'] ?? null,
            $validated['notes'] ?? null,
        );

        return response()->json([
            'data' => new WalletTransactionResource($transaction),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /**
     * « Envoyer à un Admin » — le chemin inverse de la remise au patron.
     *
     * Même double écriture, même transaction unique, même plafond au solde
     * disponible. Le service refuse une source qui ne serait pas un
     * portefeuille de Super Admin, et une destination qui en serait un.
     */
    public function sendToAdmin(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            'allow_duplicate' => ['nullable', 'boolean'],
        ]);

        $source = $this->wallets->walletFor($request->user());
        $destination = Wallet::findOrFail($validated['wallet_id']);

        $legs = $this->wallets->transferToAdmin(
            $source,
            $destination,
            (float) $validated['amount'],
            $request->user(),
            $validated['description'] ?? null,
            $validated['reference'] ?? null,
            (bool) ($validated['allow_duplicate'] ?? false),
        );

        return response()->json([
            'data' => new WalletTransactionResource($legs['out']->load('counterpartyWallet.user')),
            'wallet' => new WalletResource($source->fresh()->load('user')),
        ], 201);
    }

    /** Totaux globaux + le tableau par admin. */
    public function overview(): JsonResponse
    {
        return response()->json(['data' => $this->wallets->overview()]);
    }

    /** Le détail d'un portefeuille, quel qu'en soit le titulaire. */
    public function show(Wallet $wallet): JsonResponse
    {
        return response()->json([
            'data' => new WalletResource($wallet->load('user')),
        ]);
    }

    /** L'historique complet d'un admin, mêmes filtres que son propre écran. */
    public function transactions(Request $request, Wallet $wallet): JsonResponse
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

        return response()->json([
            'data' => WalletTransactionResource::collection(
                $this->wallets->transactions($wallet, $filters),
            ),
        ]);
    }

    /**
     * Une correction, écrite comme un mouvement de plus.
     *
     * Il n'existe volontairement aucune route de suppression : corriger une
     * écriture financière, c'est en ajouter une, jamais en retirer une.
     */
    public function adjust(Request $request, Wallet $wallet): JsonResponse
    {
        $validated = $request->validate([
            // Signé : négatif pour retirer, positif pour ajouter.
            'amount' => ['required', 'numeric'],
            'reason' => ['required', 'string', 'max:255'],
            'bucket' => ['nullable', Rule::in([
                WalletTransaction::BUCKET_AVAILABLE,
                WalletTransaction::BUCKET_CASH_FUND,
            ])],
        ]);

        $transaction = $this->wallets->adjust(
            $wallet,
            (float) $validated['amount'],
            $validated['reason'],
            $request->user(),
            $validated['bucket'] ?? WalletTransaction::BUCKET_AVAILABLE,
        );

        return response()->json([
            'data' => new WalletTransactionResource($transaction),
            'wallet' => new WalletResource($wallet->fresh()->load('user')),
        ], 201);
    }

    /**
     * Contre-passe un mouvement : l'original reste, son inverse s'ajoute.
     *
     * Les deux jambes d'un transfert sont contre-passées ensemble — annuler un
     * seul côté laisserait les deux portefeuilles en désaccord.
     */
    public function reverse(Request $request, WalletTransaction $walletTransaction): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $reversals = $this->wallets->reverse(
            $walletTransaction,
            $request->user(),
            $validated['reason'],
        );

        return response()->json([
            'data' => WalletTransactionResource::collection(collect($reversals)),
        ], 201);
    }
}
