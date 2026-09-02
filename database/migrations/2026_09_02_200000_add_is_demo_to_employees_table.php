<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marque les fiches employé de démonstration — celle du Google Play Reviewer.
 *
 * Même motif que `is_company` : un booléen sur la fiche, et des exclusions
 * EXPLICITES aux endroits où une fiche de test fausserait le réel — la paie,
 * la checklist de clôture mensuelle (une commission de test ne doit jamais
 * bloquer la clôture d'un vrai mois), la liste « reste à payer » du
 * portefeuille, le compteur du dashboard et les sélecteurs de la caisse.
 *
 * C'est aussi le fil qui rend TOUT ce que le reviewer crée identifiable et
 * nettoyable : ses prestations, lignes et commissions pointent sur cette
 * fiche. Aucune colonne à ajouter sur les tables métier, aucune donnée
 * existante modifiée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('is_demo')->default(false)->after('is_company');
            $table->index('is_demo');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['is_demo']);
            $table->dropColumn('is_demo');
        });
    }
};
