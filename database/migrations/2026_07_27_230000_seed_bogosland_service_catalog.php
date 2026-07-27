<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $now = now();

        foreach ($this->services() as $service) {
            $exists = DB::table('services')->where('name', $service['name'])->exists();

            if ($exists) {
                DB::table('services')
                    ->where('name', $service['name'])
                    ->update([
                        ...$service,
                        'is_active' => true,
                        'updated_at' => $now,
                    ]);

                continue;
            }

            DB::table('services')->insert([
                ...$service,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('services')
            ->whereIn('name', array_column($this->services(), 'name'))
            ->delete();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function services(): array
    {
        return [
            ['name' => 'Coupe cheveux + barbe', 'category' => 'coiffure', 'duration_minutes' => 45, 'price' => 70, 'color' => '#C8A24C'],
            ['name' => 'Coupe simple', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 40, 'color' => '#C8A24C'],
            ['name' => 'Coupe enfant (-12 ans)', 'category' => 'coiffure', 'duration_minutes' => 25, 'price' => 30, 'color' => '#C8A24C'],
            ['name' => 'Soin cheveux', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 50, 'color' => '#C8A24C'],
            ['name' => 'Tour d\'oreilles', 'category' => 'coiffure', 'duration_minutes' => 15, 'price' => 30, 'color' => '#C8A24C'],
            ['name' => 'Brushing / Coiffage', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 30, 'color' => '#C8A24C'],
            ['name' => 'Coloration cheveux', 'category' => 'coiffure', 'duration_minutes' => 90, 'price' => 150, 'color' => '#C8A24C'],
            ['name' => 'Défrisage', 'category' => 'coiffure', 'duration_minutes' => 90, 'price' => 100, 'color' => '#C8A24C'],
            ['name' => 'Kératine (à partir de)', 'category' => 'coiffure', 'duration_minutes' => 120, 'price' => 300, 'color' => '#C8A24C'],
            ['name' => 'Protéine (à partir de)', 'category' => 'coiffure', 'duration_minutes' => 120, 'price' => 400, 'color' => '#C8A24C'],
            ['name' => 'Barbe simple', 'category' => 'coiffure', 'duration_minutes' => 20, 'price' => 40, 'color' => '#C8A24C'],
            ['name' => 'Barbe tracée', 'category' => 'coiffure', 'duration_minutes' => 25, 'price' => 50, 'color' => '#C8A24C'],
            ['name' => 'Rasage vapeur', 'category' => 'coiffure', 'duration_minutes' => 35, 'price' => 80, 'color' => '#C8A24C'],
            ['name' => 'Coloration barbe', 'category' => 'coiffure', 'duration_minutes' => 45, 'price' => 100, 'color' => '#C8A24C'],
            ['name' => 'Black mask', 'category' => 'coiffure', 'duration_minutes' => 20, 'price' => 40, 'color' => '#C8A24C'],
            ['name' => 'Soin visage express 15 min', 'category' => 'coiffure', 'duration_minutes' => 15, 'price' => 80, 'color' => '#C8A24C'],
            ['name' => 'Soin visage vapeur 30 min', 'category' => 'coiffure', 'duration_minutes' => 30, 'price' => 120, 'color' => '#C8A24C'],
            ['name' => 'L\'hydrafacial', 'category' => 'coiffure', 'duration_minutes' => 45, 'price' => 300, 'color' => '#C8A24C'],
            ['name' => 'Hammam turc', 'category' => 'hammam', 'duration_minutes' => 45, 'price' => 150, 'color' => '#4C7CC8'],
            ['name' => 'Hammam royale', 'category' => 'hammam', 'duration_minutes' => 60, 'price' => 250, 'color' => '#4C7CC8'],
            ['name' => 'Massage sportif 30 min', 'category' => 'massage', 'duration_minutes' => 30, 'price' => 250, 'color' => '#8C6BC8'],
            ['name' => 'Massage sportif 60 min', 'category' => 'massage', 'duration_minutes' => 60, 'price' => 450, 'color' => '#8C6BC8'],
            ['name' => 'Hijama', 'category' => 'massage', 'duration_minutes' => 45, 'price' => 250, 'color' => '#8C6BC8'],
        ];
    }
};
