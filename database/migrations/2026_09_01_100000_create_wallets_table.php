<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Portefeuilles.
 *
 * Un portefeuille par utilisateur, créé à la demande et TOUJOURS à zéro : cette
 * migration n'importe rien, ne recalcule rien et ne touche à aucune table
 * existante. Les résultats de caisse de juillet et d'août restent où ils sont,
 * dans les rapports ; ils n'alimentent aucun solde ici (voir config/wallet.php).
 *
 * Deux soldes distincts et volontairement séparés :
 *
 *  - `balance`           — l'argent disponible chez l'admin ;
 *  - `cash_fund_balance` — la part mise de côté comme fond de caisse.
 *
 * Le fond de caisse n'est PAS de l'argent envoyé au patron : le distinguer par
 * une colonne, plutôt que par un simple libellé de mouvement, rend l'erreur
 * impossible à commettre à la lecture comme à l'écriture.
 *
 * Ces deux colonnes sont un cache : la vérité reste le ledger
 * (`wallet_transactions`), et un test de réconciliation vérifie que la somme
 * des mouvements redonne exactement ces soldes. Elles existent pour pouvoir
 * verrouiller une ligne (`lockForUpdate`) pendant un transfert et pour lire un
 * solde sans agréger tout l'historique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            // Un seul portefeuille par compte : c'est ce qui permet de dire
            // « le wallet de cet admin » sans jamais avoir à en choisir un.
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('type', 20)->default('admin'); // admin | super_admin
            $table->decimal('balance', 12, 2)->default(0);
            $table->decimal('cash_fund_balance', 12, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallets');
    }
};
