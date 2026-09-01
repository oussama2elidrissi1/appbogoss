<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le ledger — l'historique financier du portefeuille.
 *
 * Append-only par construction : aucune ligne n'est jamais supprimée ni
 * modifiée. Une correction s'écrit comme un mouvement inverse de type
 * `ADJUSTMENT` pointant sur la ligne corrigée (`reverses_transaction_id`), de
 * sorte que l'erreur ET sa correction restent lisibles.
 *
 * L'index unique `wallet_tx_source_unique` est le garde-fou central : il rend
 * physiquement impossible qu'une même journée de caisse crédite deux fois, ou
 * qu'une même dépense soit débitée deux fois. Le service vérifie d'abord et
 * répond proprement ; l'index n'attrape que la course entre la vérification et
 * l'écriture. NULL restant distinct de NULL dans un index unique (MySQL comme
 * SQLite), les mouvements sans source (transferts, ajustements) ne sont pas
 * contraints — ce qui est bien le comportement voulu.
 *
 * `balance_after` / `cash_fund_after` figent les deux soldes juste après le
 * mouvement. Redondant avec le calcul, et c'est le but : un relevé reste
 * relisable même si le code de calcul change plus tard.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            // Le portefeuille d'en face pour un transfert. Les deux jambes se
            // pointent mutuellement et partagent le meme `transfer_group`.
            $table->foreignId('counterparty_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->uuid('transfer_group')->nullable();

            // CASH_REGISTER_RESULT | TRANSFER_TO_SUPER_ADMIN | EXPENSE
            // | CASH_FUND | CASH_FUND_RETURN | ADJUSTMENT
            $table->string('type', 40);
            $table->string('direction', 3);              // in | out
            $table->string('bucket', 16)->default('available'); // available | cash_fund
            $table->decimal('amount', 12, 2);            // toujours positif
            $table->decimal('balance_after', 12, 2);
            $table->decimal('cash_fund_after', 12, 2);

            $table->foreignId('performed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            // Source metier liee : WorkDay, Expense... Ecrite a la main plutot
            // qu'avec nullableMorphs() pour borner `source_type` a 191
            // caracteres et garder l'index unique ci-dessous sous la limite de
            // taille de cle d'InnoDB en utf8mb4.
            $table->string('source_type', 191)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();

            $table->foreignId('reverses_transaction_id')->nullable()
                ->constrained('wallet_transactions')->nullOnDelete();

            $table->string('category')->nullable();
            $table->string('reference')->nullable();
            $table->string('description', 500)->nullable();

            // Date metier du mouvement (la date de la journee de caisse, la
            // date de la depense...), distincte de l'instant d'ecriture.
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['source_type', 'source_id', 'type'], 'wallet_tx_source_unique');
            $table->index(['wallet_id', 'occurred_at']);
            $table->index(['source_type', 'source_id']);
            $table->index('transfer_group');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_transactions');
    }
};
