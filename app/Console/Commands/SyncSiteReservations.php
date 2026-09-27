<?php

namespace App\Console\Commands;

use App\Services\SiteReservationSync;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Réservations du site bogosland.com → agenda, et statuts dans les deux sens
 * (voir App\Services\SiteReservationSync).
 *
 * Lancée directement par le cron du serveur, toutes les 5 minutes :
 *   *\/5 * * * * cd ~/public_html/app && php artisan site-reservations:sync
 * — pas via `schedule:run`, qui déclencherait aussi les autres tâches
 * planifiées de Console\Kernel.
 */
class SyncSiteReservations extends Command
{
    protected $signature = 'site-reservations:sync';

    protected $description = 'Importe les réservations du site bogosland.com dans l’agenda et synchronise leurs statuts';

    public function handle(SiteReservationSync $sync): int
    {
        if (! $sync->configured()) {
            $this->warn('WP_DB_DATABASE non configurée : rien à synchroniser.');

            return self::SUCCESS;
        }

        $lock = Cache::lock('site-reservations:sync', 600);
        if (! $lock->get()) {
            return self::SUCCESS; // le passage précédent n'est pas fini
        }

        try {
            $summary = $sync->run();
        } finally {
            $lock->release();
        }

        // Silencieux quand rien ne bouge : le cron tourne toutes les 5 minutes.
        if ($summary['imported'] + $summary['to_agenda'] + $summary['to_site'] === 0 && $summary['skipped'] === []) {
            return self::SUCCESS;
        }

        $line = sprintf(
            'Réservations du site : %d importée(s), %d statut(s) site → agenda, %d agenda → site.',
            $summary['imported'],
            $summary['to_agenda'],
            $summary['to_site'],
        );
        $this->info(now()->format('Y-m-d H:i:s').' '.$line);
        foreach ($summary['skipped'] as $skipped) {
            $this->warn('  Ignorée '.$skipped);
        }
        Log::info($line, ['skipped' => $summary['skipped']]);

        return self::SUCCESS;
    }
}
