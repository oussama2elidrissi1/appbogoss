<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('is_company')->default(false)->after('is_active');
            $table->string('company_area', 30)->nullable()->after('is_company')->unique();
        });

        $now = now();
        DB::table('employees')->upsert([
            [
                'name' => 'Vitrine',
                'role' => 'stock_societe',
                'avatar_color' => '#C8A24C',
                'is_active' => true,
                'is_company' => true,
                'company_area' => 'vitrine',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Réfrigérateur',
                'role' => 'stock_societe',
                'avatar_color' => '#4C7CC8',
                'is_active' => true,
                'is_company' => true,
                'company_area' => 'refrigerateur',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ], ['company_area'], ['name', 'role', 'avatar_color', 'is_active', 'is_company', 'updated_at']);
    }

    public function down(): void
    {
        DB::table('employees')->whereIn('company_area', ['vitrine', 'refrigerateur'])->delete();

        Schema::table('employees', function (Blueprint $table) {
            $table->dropUnique(['company_area']);
            $table->dropColumn(['company_area', 'is_company']);
        });
    }
};
