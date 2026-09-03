<?php

use App\Models\WalletTransaction;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rend les réattributions de résultats de caisse identifiables comme telles.
 *
 * Les premières réparations (`wallet:sync-closed-days --repair-owners`)
 * écrivaient chez l'admin un AJUSTEMENT ordinaire : sans marqueur ni lien vers
 * la journée, le compteur « Résultats de caisse reçus » l'ignorait — 1 548 DH
 * réattribués du 01/09/2026 manquaient à l'écran alors que l'argent était bien
 * là. Le code marque désormais ces mouvements (`category =
 * cash_register_correction`) et lie le crédit de réattribution à sa journée ;
 * cette migration rattrape les lignes écrites avant.
 *
 * Deux familles de lignes, reconnues chacune par un signal sûr :
 *
 *  - les CONTRE-PASSES d'un crédit de caisse, par leur lien
 *    `reverses_transaction_id` vers un mouvement CASH_REGISTER_RESULT ;
 *  - les CRÉDITS de réattribution, par la description qu'écrivait la
 *    commande (« Réattribution du résultat de caisse du JJ/MM/AAAA… »),
 *    dont la date permet en plus de retrouver la journée et de poser le lien
 *    `source` — celui que l'index unique `wallet_tx_source_unique` utilise
 *    pour interdire toute seconde réattribution de la même journée.
 *
 * Le ledger reste append-only dans son sens financier : aucun montant, sens ou
 * solde n'est touché — seuls des attributs de classement sont complétés.
 */
return new class extends Migration
{
    public function up(): void
    {
        $category = WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION;

        // 1) Les contre-passes de crédits de caisse. Les identifiants sont
        // lus d'abord : MySQL refuse un UPDATE qui sous-interroge la table
        // qu'il modifie, et le volume ne justifie aucune finesse.
        $reversalIds = DB::table('wallet_transactions as reversal')
            ->join('wallet_transactions as original', 'original.id', '=', 'reversal.reverses_transaction_id')
            ->where('reversal.type', WalletTransaction::TYPE_ADJUSTMENT)
            ->whereNull('reversal.category')
            ->where('original.type', WalletTransaction::TYPE_CASH_REGISTER_RESULT)
            ->pluck('reversal.id');

        if ($reversalIds->isNotEmpty()) {
            DB::table('wallet_transactions')
                ->whereIn('id', $reversalIds)
                ->update(['category' => $category]);
        }

        // 2) Les crédits de réattribution, reconnus par leur description.
        $credits = DB::table('wallet_transactions')
            ->where('type', WalletTransaction::TYPE_ADJUSTMENT)
            ->whereNull('reverses_transaction_id')
            ->where('description', 'like', 'Réattribution du résultat de caisse%')
            ->get(['id', 'category', 'source_id', 'description']);

        $morphClass = (new WorkDay)->getMorphClass();

        foreach ($credits as $credit) {
            $update = [];

            if ($credit->category === null) {
                $update['category'] = $category;
            }

            if ($credit->source_id === null
                && preg_match('#(\d{2}/\d{2}/\d{4})#', (string) $credit->description, $matches) === 1) {
                $date = CarbonImmutable::createFromFormat('d/m/Y', $matches[1])->toDateString();
                $dayId = DB::table('work_days')->whereDate('date', $date)->value('id');

                // Le lien n'est posé que si la journée existe et que la place
                // est libre : l'index unique (source, type) doit rester le
                // verrou anti-double-comptage, pas une cause d'échec ici.
                $slotTaken = $dayId === null || DB::table('wallet_transactions')
                    ->where('source_type', $morphClass)
                    ->where('source_id', $dayId)
                    ->where('type', WalletTransaction::TYPE_ADJUSTMENT)
                    ->exists();

                if (! $slotTaken) {
                    $update['source_type'] = $morphClass;
                    $update['source_id'] = $dayId;
                }
            }

            if ($update !== []) {
                DB::table('wallet_transactions')->where('id', $credit->id)->update($update);
            }
        }
    }

    public function down(): void
    {
        // Retire le marqueur, y compris sur les lignes écrites par le nouveau
        // code — après rollback, c'est l'ancien modèle qui fait foi et il ne
        // connaît pas cette catégorie. Les liens `source` posés restent : ils
        // sont exacts, et les enlever rouvrirait le double comptage.
        DB::table('wallet_transactions')
            ->where('type', WalletTransaction::TYPE_ADJUSTMENT)
            ->where('category', WalletTransaction::CATEGORY_CASH_REGISTER_CORRECTION)
            ->update(['category' => null]);
    }
};
