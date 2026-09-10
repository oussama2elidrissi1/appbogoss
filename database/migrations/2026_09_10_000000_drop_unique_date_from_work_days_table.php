<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * La regle metier est « une seule journee OUVERTE a la fois », pas « une
     * seule journee par date » : un salon qui cloture apres minuit, ou qui
     * rouvre la caisse apres une cloture prematuree, a legitimement deux
     * sessions sur la meme date. L'unicite sur `date` transformait ce cas en
     * violation de contrainte (erreur 500 « Server Error » a l'ouverture).
     * L'index simple reste : les rapports filtrent toujours par date.
     */
    public function up(): void
    {
        Schema::table('work_days', function (Blueprint $table) {
            $table->dropUnique('work_days_date_unique');
            $table->index('date', 'work_days_date_index');
        });
    }

    public function down(): void
    {
        Schema::table('work_days', function (Blueprint $table) {
            $table->dropIndex('work_days_date_index');
            $table->unique('date', 'work_days_date_unique');
        });
    }
};
