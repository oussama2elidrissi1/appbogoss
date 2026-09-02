<?php

namespace App\Console\Commands;

use App\Http\Middleware\ReviewerSandbox;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Crée (ou réinitialise) le compte de validation Google Play.
 *
 *   php artisan reviewer:setup
 *
 * Identifiants : `GOOGLE_REVIEWER_EMAIL` et `GOOGLE_REVIEWER_PASSWORD` dans
 * le .env — jamais dans le code ni dans Git. Sans mot de passe fourni, un
 * mot de passe aléatoire est généré et affiché UNE FOIS dans la console.
 *
 * Idempotent : relançable pour réinitialiser le mot de passe ou réparer la
 * fiche, sans jamais dupliquer le compte ni toucher une autre donnée.
 */
class SetupGoogleReviewerAccount extends Command
{
    protected $signature = 'reviewer:setup {--password= : Remplace GOOGLE_REVIEWER_PASSWORD pour cette exécution}';

    protected $description = 'Crée ou réinitialise le compte Google Play Reviewer (rôle google_reviewer + fiche employé de démonstration)';

    public function handle(): int
    {
        $email = (string) env('GOOGLE_REVIEWER_EMAIL', 'google.review@bogosland.com');
        $password = (string) ($this->option('password') ?: env('GOOGLE_REVIEWER_PASSWORD', ''));

        $generated = false;
        if ($password === '') {
            $password = Str::password(16, symbols: false);
            $generated = true;
        }

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $user = User::query()->create([
                'name' => 'Google Play Reviewer',
                'email' => $email,
                'password' => Hash::make($password),
                'role' => ReviewerSandbox::ROLE,
                'is_active' => true,
            ]);
            $this->info("Compte créé : {$email}");
        } else {
            $user->forceFill([
                'name' => 'Google Play Reviewer',
                'password' => Hash::make($password),
                'role' => ReviewerSandbox::ROLE,
                'is_active' => true,
            ])->save();
            $this->info("Compte existant réinitialisé : {$email}");
        }

        // Le rôle est l'identité — aucune logique par email nulle part.
        $user->syncRoles([ReviewerSandbox::ROLE]);

        Employee::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'name' => 'Google Play Reviewer',
                'role' => 'Démonstration',
                'email' => $email,
                'avatar_color' => '#4C7CC8',
                'is_active' => true,
                'is_demo' => true,
            ],
        );

        $this->info('Fiche employé de démonstration liée (is_demo = true).');

        if ($generated) {
            $this->warn('Aucun GOOGLE_REVIEWER_PASSWORD fourni — mot de passe généré (affiché une seule fois) :');
            $this->line("  {$password}");
        }

        $this->line('Écritures autorisées côté serveur : composer une prestation de démonstration, rien d\'autre (middleware ReviewerSandbox).');

        return self::SUCCESS;
    }
}
