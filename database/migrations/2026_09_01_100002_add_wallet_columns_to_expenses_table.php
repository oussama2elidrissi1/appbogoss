<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rattache les dépenses au portefeuille — sans dupliquer la table.
 *
 * Il existe désormais deux dépenses de nature différente, et la même table les
 * porte toutes les deux :
 *
 *  - `origin = 'caisse'` — la dépense historique, rattachée à une journée de
 *    caisse. Elle est DÉJÀ déduite du résultat de la journée, donc déjà
 *    reflétée dans le crédit du portefeuille. Elle ne doit surtout pas être
 *    débitée une seconde fois.
 *
 *  - `origin = 'wallet'` — la dépense payée sur l'argent que l'admin détient
 *    (assurance, batterie, tailleur...). Elle débite le portefeuille et n'a
 *    aucune journée de caisse.
 *
 * Toutes les lignes existantes reçoivent `caisse` : c'est la valeur par défaut
 * de la colonne, aucun UPDATE n'est nécessaire et aucun montant ne bouge.
 *
 * Le filtrage se fait ensuite EXPLICITEMENT, via `Expense::caisse()`, aux
 * quatre endroits qui agrègent les dépenses de caisse (rapport mensuel,
 * dashboard mois, série 30 jours, liste /expenses). Pas de global scope :
 * une exclusion invisible dans un rapport financier est exactement le genre de
 * chose qu'on ne retrouve plus six mois après.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->string('origin', 16)->default('caisse')->after('work_day_id');
            $table->foreignId('wallet_id')->nullable()->after('origin')->constrained()->nullOnDelete();
            // Qui a saisi la dépense. Nullable : les lignes historiques ne le
            // savent pas, et l'inventer serait une donnée fausse.
            $table->foreignId('user_id')->nullable()->after('wallet_id')->constrained()->nullOnDelete();
            $table->string('reference')->nullable()->after('spent_on');
            $table->text('notes')->nullable()->after('reference');

            $table->index('origin');
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropIndex(['origin']);
            $table->dropConstrainedForeignId('wallet_id');
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn(['origin', 'reference', 'notes']);
        });
    }
};
