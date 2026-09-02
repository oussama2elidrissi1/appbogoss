<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\Prestation;
use Illuminate\Console\Command;

/**
 * Supprime les données de test créées par le compte Google Play Reviewer.
 *
 *   php artisan reviewer:cleanup --dry-run   # voir ce qui serait supprimé
 *   php artisan reviewer:cleanup             # supprimer réellement
 *
 * Le périmètre est STRICTEMENT borné par la fiche employé `is_demo` : seules
 * les prestations rattachées à une fiche de démonstration partent — lignes,
 * journaux de statut et commissions suivent par les cascades de clés
 * étrangères déjà en place (le mécanisme de suppression existant, rien de
 * nouveau). Le compte et la fiche restent : une prochaine validation Google
 * Play réutilise les mêmes identifiants.
 *
 * Une prestation de test ne peut par construction être ni payée ni en caisse
 * (ReviewerSandbox bloque send-to-caisse et confirm-payment) : aucune vente,
 * aucun mouvement de caisse ou de portefeuille n'est concerné.
 */
class CleanupGoogleReviewerData extends Command
{
    protected $signature = 'reviewer:cleanup {--dry-run : Liste sans supprimer}';

    protected $description = 'Supprime les prestations de démonstration du compte Google Play Reviewer';

    public function handle(): int
    {
        $demoEmployeeIds = Employee::query()->where('is_demo', true)->pluck('id');

        if ($demoEmployeeIds->isEmpty()) {
            $this->info('Aucune fiche employé de démonstration — rien à nettoyer.');

            return self::SUCCESS;
        }

        $prestations = Prestation::query()
            ->withTrashed()
            ->whereIn('employee_id', $demoEmployeeIds)
            ->withCount('items')
            ->orderBy('id')
            ->get();

        if ($prestations->isEmpty()) {
            $this->info('Aucune prestation de démonstration à supprimer.');

            return self::SUCCESS;
        }

        foreach ($prestations as $prestation) {
            $this->line(sprintf(
                '  #%d — %s, %d ligne(s), statut %s',
                $prestation->id,
                $prestation->created_at?->format('d/m/Y H:i') ?? '?',
                $prestation->items_count,
                $prestation->status,
            ));
        }

        if ($this->option('dry-run')) {
            $this->info(sprintf('[dry-run] %d prestation(s) de démonstration seraient supprimées.', $prestations->count()));

            return self::SUCCESS;
        }

        foreach ($prestations as $prestation) {
            // forceDelete, pas delete : Prestation est en soft delete, or un
            // nettoyage de démonstration doit vraiment disparaître — et seules
            // les vraies suppressions déclenchent les cascades (lignes,
            // journaux, commissions) des clés étrangères.
            $prestation->forceDelete();
        }

        $this->info(sprintf('%d prestation(s) de démonstration supprimées (lignes, journaux et commissions suivent en cascade).', $prestations->count()));

        return self::SUCCESS;
    }
}
