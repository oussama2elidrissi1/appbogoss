<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

/**
 * Compte staff dédié à la validation de l'application mobile (Phase 1).
 *
 * Idempotent, et volontairement incapable de modifier un compte existant :
 * firstOrCreate() ne touche jamais une ligne déjà présente, et l'attribution
 * du rôle est conditionnée à ce seul utilisateur. Ré-exécuter ce seeder sur
 * une base peuplée ne change donc rien d'autre.
 *
 * ATTENTION — environnement LOCAL uniquement. Ces identifiants sont écrits en
 * clair dans le dépôt : ce compte ne doit jamais exister sur cPanel. Le
 * seeder refuse d'ailleurs de s'exécuter hors `local`/`testing`.
 *
 * Choix du rôle `admin` plutôt que `super-admin` : AuthServiceProvider déclare
 * `Gate::before(fn ($user) => $user->hasRole('super-admin') ? true : null)`,
 * qui court-circuite TOUTE vérification d'autorisation. Tester le mobile avec
 * un super-admin masquerait donc n'importe quelle erreur de permission — on ne
 * verrait jamais un 403 légitime. `admin` traverse au contraire le vrai
 * middleware `permission:` et porte un jeu de permissions riche, ce qui rend
 * l'affichage des permissions côté mobile réellement significatif.
 */
class MobileTestAccountSeeder extends Seeder
{
    public const EMAIL = 'mobile.test@bogosland.local';

    /** En clair et assumé : compte de test local, jamais déployé. */
    public const PASSWORD = 'TestMobile2026!';

    public const NAME = 'Mobile Test';

    private const ROLE = 'admin';

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command?->error(
                'Refus : ce seeder crée un compte à mot de passe connu et ne '
                .'doit tourner qu\'en local (APP_ENV='.app()->environment().').'
            );

            return;
        }

        // Le rôle n'est pas créé ici : sa définition appartient à
        // RolesAndPermissionsSeeder, seule source de vérité des rôles et
        // permissions. Le dupliquer ferait diverger les deux.
        $role = Role::where('name', self::ROLE)->where('guard_name', 'web')->first();

        if ($role === null) {
            $this->command?->error(
                "Le rôle « ".self::ROLE." » n'existe pas. Lancez d'abord :\n"
                .'  php artisan db:seed --class=RolesAndPermissionsSeeder'
            );

            return;
        }

        $existed = User::where('email', self::EMAIL)->exists();

        $user = User::firstOrCreate(
            ['email' => self::EMAIL],
            [
                'name' => self::NAME,
                'password' => Hash::make(self::PASSWORD),
                'role' => self::ROLE,
                'is_active' => true,
            ],
        );

        if (! $user->hasRole(self::ROLE)) {
            $user->assignRole(self::ROLE);
        }

        // Fiche employé de test, requise pour ouvrir l'espace employé du
        // mobile : EmployeeWorkspaceController::employeeOrFail() renvoie 403
        // tant que $user->employee est null.
        //
        // Clé de recherche = user_id (colonne UNIQUE depuis la migration
        // 2026_08_04_165232) : ré-exécuter le seeder retrouve la même fiche au
        // lieu d'en créer une seconde, et aucune fiche employé réelle ne peut
        // être atteinte puisque la recherche porte sur l'utilisateur de test.
        //
        // Données strictement minimales : `name` est la seule colonne sans
        // valeur par défaut. `is_company` reste false — une pseudo-fiche
        // société (vitrine/réfrigérateur) ne peut réaliser aucun service
        // (cf. Employee::canPerform()). Aucune contrainte de catégorie ni de
        // liste blanche n'est posée, ce qui laisse le catalogue entier visible.
        $employee = Employee::firstOrCreate(
            ['user_id' => $user->id],
            [
                'name' => self::NAME,
                'role' => 'coiffeur',
                'email' => self::EMAIL,
                'is_active' => true,
                'is_company' => false,
            ],
        );

        $this->command?->info($existed
            ? 'Compte de test mobile déjà présent — inchangé.'
            : 'Compte de test mobile créé.');
        $this->command?->info('  E-mail       : '.self::EMAIL);
        $this->command?->info('  Mot de passe : '.self::PASSWORD);
        $this->command?->info('  Rôle         : '.self::ROLE);
        $this->command?->info('  Permissions  : '.$user->getAllPermissions()->count());
        $this->command?->info('  Fiche employé: #'.$employee->id.' ('.$employee->name.')');
        $this->command?->warn('  -> Compte LOCAL de test. Ne jamais déployer.');
    }
}
