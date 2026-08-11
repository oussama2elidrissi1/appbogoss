<?php

namespace Database\Seeders;

use App\Models\Service;
use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

/**
 * Demo subscription plans exercising every rule of the engine — idempotent
 * (firstOrCreate by name), safe to run on an existing catalog.
 *
 * Run: php artisan db:seed --class=DemoSubscriptionPlansSeeder
 */
class DemoSubscriptionPlansSeeder extends Seeder
{
    public function run(): void
    {
        $hammam = Service::firstOrCreate(
            ['name' => 'Hammam Turc'],
            ['category' => 'hammam', 'duration_minutes' => 45, 'price' => 150, 'color' => '#38BDF8', 'is_active' => true],
        );
        $massage = Service::firstOrCreate(
            ['name' => 'Massage relaxant'],
            ['category' => 'massage', 'duration_minutes' => 60, 'price' => 250, 'color' => '#A78BFA', 'is_active' => true],
        );

        // PLAN 1 — simple visit pack.
        $essentiel = SubscriptionPlan::firstOrCreate(['name' => 'Hammam Essentiel'], [
            'description' => '8 hammams à utiliser sous 30 jours.',
            'price' => 900,
            'duration_value' => 30,
            'duration_unit' => 'days',
            'is_active' => true,
            'allow_renewal' => true,
        ]);
        $essentiel->services()->firstOrCreate(['service_id' => $hammam->id], [
            'quota_total' => 8,
            'commission_basis' => 'public_price',
        ]);

        // PLAN 2 — mornings only.
        $matin = SubscriptionPlan::firstOrCreate(['name' => 'Hammam Matin'], [
            'description' => '10 hammams, valable uniquement de 08:00 à 12:00.',
            'price' => 750,
            'duration_value' => 30,
            'duration_unit' => 'days',
            'is_active' => true,
            'allow_renewal' => true,
            'time_start' => '08:00',
            'time_end' => '12:00',
        ]);
        $matin->services()->firstOrCreate(['service_id' => $hammam->id], [
            'quota_total' => 10,
            'commission_basis' => 'public_price',
        ]);

        // PLAN 3 — unlimited but throttled.
        $illimite = SubscriptionPlan::firstOrCreate(['name' => 'Hammam Illimité'], [
            'description' => 'Hammam illimité pendant 30 jours — maximum 1 passage toutes les 6 heures.',
            'price' => 1500,
            'duration_value' => 30,
            'duration_unit' => 'days',
            'is_active' => true,
            'allow_renewal' => true,
            'max_per_day' => 2,
            'min_interval_minutes' => 360,
        ]);
        $illimite->services()->firstOrCreate(['service_id' => $hammam->id], [
            'commission_basis' => 'fixed',
            'commission_value' => 20,
        ]);

        // PLAN 4 — multi-service premium.
        $premium = SubscriptionPlan::firstOrCreate(['name' => 'Premium Hammam & Massage'], [
            'description' => '90 jours — 3 hammams par semaine et 6 massages au total, 2 visites max par jour.',
            'price' => 3200,
            'duration_value' => 90,
            'duration_unit' => 'days',
            'is_active' => true,
            'allow_renewal' => true,
            'allow_suspension' => true,
            'max_per_day' => 2,
        ]);
        $premium->services()->firstOrCreate(['service_id' => $hammam->id], [
            'quota_period' => 'week',
            'quota_per_period' => 3,
            'commission_basis' => 'public_price',
        ]);
        $premium->services()->firstOrCreate(['service_id' => $massage->id], [
            'quota_total' => 6,
            'commission_basis' => 'percent',
            'commission_value' => 10,
        ]);
    }
}
