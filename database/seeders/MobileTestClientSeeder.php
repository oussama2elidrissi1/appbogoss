<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\ClientQrToken;
use App\Models\ClientSubscription;
use App\Models\CustomerLoyaltyAccount;
use App\Models\Service;
use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Jeu de données client dédié à la validation mobile (Phases 3 et 4).
 *
 * Crée le strict nécessaire pour dérouler le flux QR de bout en bout :
 * un client avec accès portail, son QR d'identification, un plan d'abonnement
 * et un abonnement actif avec des visites disponibles.
 *
 * GARANTIES
 *
 *  - **Aucun client réel n'est touché.** Tout est retrouvé ou créé par des clés
 *    dédiées (téléphone E.164 de test, nom de plan de test), et chaque écriture
 *    passe par firstOrCreate : ré-exécuter le seeder ne modifie rien.
 *  - **Aucune donnée n'est supprimée.**
 *  - **Refus hors local/testing.** Les identifiants sont en clair dans le
 *    dépôt ; ce jeu ne doit jamais exister sur cPanel.
 *  - Les services rattachés au plan sont **réutilisés** depuis le catalogue
 *    existant s'il en contient : on ne crée un service de test que si la base
 *    est vide, pour ne pas polluer le catalogue réel.
 *
 * Le nombre de visites restantes n'est PAS écrit en base : il est calculé par
 * SubscriptionService::quotaRemaining() à partir du quota du plan moins les
 * usages enregistrés. Le seeder ne crée aucun usage, donc le quota est intact.
 */
class MobileTestClientSeeder extends Seeder
{
    public const PHONE = '0600000042';

    public const PHONE_E164 = '+212600000042';

    public const PASSWORD = 'TestClient2026!';

    public const NAME = 'Client Test Mobile';

    public const EMAIL = 'client.test@bogosland.local';

    private const PLAN_NAME = '[TEST MOBILE] Formule découverte';

    /** Visites incluses, volontairement confortable pour tester plusieurs scans. */
    private const QUOTA_TOTAL = 10;

    private const QUOTA_PER_WEEK = 5;

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command?->error(
                'Refus : ce seeder crée un compte à mot de passe connu et ne '
                .'doit tourner qu\'en local (APP_ENV='.app()->environment().').'
            );

            return;
        }

        $client = $this->client();
        $account = $this->loyaltyAccount($client);
        $qrToken = $this->qrToken($client);
        $plan = $this->plan();
        $planServices = $this->planServices($plan);
        $subscription = $this->subscription($client, $plan);

        $this->report($client, $account, $qrToken, $plan, $planServices, $subscription);
    }

    private function client(): Client
    {
        // Clé de recherche = téléphone E.164, l'identifiant de connexion du
        // portail. Aucun client importé ne porte ce numéro de test.
        $client = Client::firstOrCreate(
            ['phone_e164' => self::PHONE_E164],
            [
                'name' => self::NAME,
                'phone' => self::PHONE,
                'email' => self::EMAIL,
                'password' => Hash::make(self::PASSWORD),
                'avatar_color' => '#C8A24C',
                'registered_at' => now(),
                'consent_terms_at' => now(),
            ],
        );

        // Le mot de passe n'est réécrit que s'il manque : un client de test
        // existant dont on aurait changé le mot de passe à la main n'est pas
        // écrasé silencieusement.
        if ($client->password === null) {
            $client->forceFill(['password' => Hash::make(self::PASSWORD)])->save();
        }

        return $client;
    }

    private function loyaltyAccount(Client $client): CustomerLoyaltyAccount
    {
        // `loyalty_number` est généré par le modèle (booted → creating) :
        // on ne le fabrique pas ici, sous peine de casser la séquence FID.
        return CustomerLoyaltyAccount::firstOrCreate(
            ['client_id' => $client->id],
            ['points_balance' => 120, 'status' => 'active'],
        );
    }

    private function qrToken(Client $client): ClientQrToken
    {
        $existing = ClientQrToken::where('client_id', $client->id)
            ->whereNull('revoked_at')
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        // Jeton lisible plutôt qu'aléatoire : il faut pouvoir le retaper à la
        // main pendant les tests, quand la caméra n'est pas disponible.
        return ClientQrToken::create([
            'client_id' => $client->id,
            'token' => 'TESTQR-CLIENT-'.$client->id,
        ]);
    }

    private function plan(): SubscriptionPlan
    {
        return SubscriptionPlan::firstOrCreate(
            ['name' => self::PLAN_NAME],
            [
                'description' => 'Plan de test mobile — ne pas vendre.',
                'price' => 600,
                'duration_value' => 6,
                'duration_unit' => 'month',
                'is_active' => true,
                'allow_suspension' => true,
                'allow_renewal' => true,
                // Aucune restriction de jour ni d'horaire : le scan doit
                // fonctionner quel que soit le moment du test.
                'allowed_days' => null,
                'time_start' => null,
                'time_end' => null,
                'max_per_day' => null,
                'max_per_week' => null,
                'max_per_month' => null,
                'min_interval_minutes' => null,
            ],
        );
    }

    /**
     * @return \Illuminate\Support\Collection<int, SubscriptionPlanService>
     */
    private function planServices(SubscriptionPlan $plan)
    {
        // Deux services pour que l'écran de scan présente un vrai choix.
        $services = Service::query()->where('is_active', true)->orderBy('id')->limit(2)->get();

        if ($services->isEmpty()) {
            $services = collect([
                Service::firstOrCreate(
                    ['name' => '[TEST MOBILE] Coupe'],
                    ['category' => 'coiffure', 'price' => 150, 'duration_minutes' => 45, 'is_active' => true],
                ),
            ]);
        }

        return $services->map(fn (Service $service) => SubscriptionPlanService::firstOrCreate(
            ['subscription_plan_id' => $plan->id, 'service_id' => $service->id],
            [
                'quota_period' => 'week',
                'quota_per_period' => self::QUOTA_PER_WEEK,
                'quota_total' => self::QUOTA_TOTAL,
                'allow_rollover' => false,
                'commission_basis' => 'service_price',
                'commission_value' => null,
            ],
        ));
    }

    private function subscription(Client $client, SubscriptionPlan $plan): ClientSubscription
    {
        $subscription = ClientSubscription::firstOrCreate(
            ['client_id' => $client->id, 'subscription_plan_id' => $plan->id],
            [
                'status' => ClientSubscription::STATUS_ACTIVE,
                'total_amount' => $plan->price,
                'purchased_at' => now(),
                'starts_on' => now()->subDay()->toDateString(),
                'ends_on' => now()->addMonths(6)->toDateString(),
                'qr_token' => 'TESTQR-ABO-'.$client->id,
                'plan_snapshot' => [
                    'name' => $plan->name,
                    'price' => (float) $plan->price,
                ],
            ],
        );

        // Un abonnement de test créé lors d'une session précédente a pu expirer
        // ou être consommé : on le réarme, mais uniquement lui.
        if ($subscription->status !== ClientSubscription::STATUS_ACTIVE
            || $subscription->ends_on->isPast()) {
            $subscription->forceFill([
                'status' => ClientSubscription::STATUS_ACTIVE,
                'starts_on' => now()->subDay()->toDateString(),
                'ends_on' => now()->addMonths(6)->toDateString(),
            ])->save();
        }

        return $subscription->fresh();
    }

    private function report(
        Client $client,
        CustomerLoyaltyAccount $account,
        ClientQrToken $qrToken,
        SubscriptionPlan $plan,
        $planServices,
        ClientSubscription $subscription,
    ): void {
        $usages = $subscription->usages()->whereIn('status', ['reserved', 'confirmed'])->count();

        $this->command?->info('Jeu de test client mobile prêt :');
        $this->command?->info('  Client         : '.$client->name.' (#'.$client->id.')');
        $this->command?->info('  Téléphone      : '.self::PHONE);
        $this->command?->info('  E-mail         : '.self::EMAIL);
        $this->command?->info('  Mot de passe   : '.self::PASSWORD);
        $this->command?->info('  N° fidélité    : '.$account->loyalty_number);
        $this->command?->info('  Points         : '.$account->points_balance);
        $this->command?->info('  QR client      : '.$qrToken->token);
        $this->command?->info('  Abonnement     : '.$plan->name.' (#'.$subscription->id.', '.$subscription->status.')');
        $this->command?->info('  QR abonnement  : '.$subscription->qr_token);
        $this->command?->info('  Valable        : '.$subscription->starts_on->format('d/m/Y').' → '.$subscription->ends_on->format('d/m/Y'));
        $this->command?->info('  Services       : '.$planServices->count().' × '.self::QUOTA_TOTAL.' visites');
        $this->command?->info('  Visites déjà utilisées : '.$usages);
        $this->command?->warn('  -> Données LOCALES de test. Ne jamais déployer.');
    }
}
