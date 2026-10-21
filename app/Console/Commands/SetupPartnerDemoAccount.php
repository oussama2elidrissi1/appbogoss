<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\Client;
use App\Models\Partner;
use App\Models\PartnerLandingSetting;
use App\Models\PartnerOffering;
use App\Models\PartnerServiceCommission;
use App\Models\Service;
use App\Models\ServicePack;
use App\Models\ServicePackItem;
use App\Models\User;
use App\Services\PartnerQrService;
use App\Services\PhoneNumberNormalizer;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Crée (ou remet à neuf) un compte partenaire de démonstration complet.
 *
 *   php artisan partner:demo-setup
 *
 * Un partenaire « Riad Atlas » avec de quoi montrer tout le portail : fiche
 * (logo, coordonnées, paiement), grille de commissions, vitrine QR (page
 * publique avec image de couverture, services et packs illustrés), clients
 * apportés et réservations passées / à venir.
 *
 * Identifiants : `PARTNER_DEMO_EMAIL` et `PARTNER_DEMO_PASSWORD` dans le .env —
 * jamais dans le code ni dans Git. Sans mot de passe fourni, un mot de passe
 * aléatoire est généré et affiché UNE FOIS dans la console.
 *
 * Idempotent : relançable pour réinitialiser le mot de passe, rafraîchir les
 * images ou replacer les réservations dans le futur, sans jamais dupliquer
 * le compte. Il ne crée AUCUNE prestation ni commission au grand livre : ces
 * lignes toucheraient la caisse, les rapports et la clôture du mois, et les
 * partenaires n'ont pas de garde `is_demo`. Les compteurs de commission
 * encaissée restent donc à zéro ; « commission estimée » se déduit des
 * réservations.
 *
 * Les images viennent de database/demo/partner/ et sont copiées sur le disque
 * `public` (donc `php artisan storage:link` doit exister en production).
 */
class SetupPartnerDemoAccount extends Command
{
    private const NOTE_MARKER = '[Démo]';

    private const IMAGE_DIR = 'partners';

    protected $signature = 'partner:demo-setup {--password= : Remplace PARTNER_DEMO_PASSWORD pour cette exécution}';

    protected $description = 'Crée ou réinitialise le compte partenaire de démonstration (fiche, logo, vitrine QR, clients, réservations)';

    /** Grille de commissions : nom du service du catalogue => [type, valeur]. */
    private const COMMISSIONS = [
        'Coupe simple' => ['percentage', 10],
        'Coupe cheveux + barbe' => ['percentage', 10],
        'Barbe tracée' => ['percentage', 10],
        'Rasage vapeur' => ['fixed', 10],
        'Hammam turc' => ['percentage', 15],
        'Hammam royale' => ['percentage', 15],
        'Massage sportif 30 min' => ['percentage', 12],
        'Massage sportif 60 min' => ['percentage', 12],
        'Soin visage vapeur 30 min' => ['fixed', 15],
        "L'hydrafacial" => ['percentage', 10],
    ];

    public function handle(): int
    {
        $role = \Spatie\Permission\Models\Role::query()->where('name', 'partner')->first();
        if ($role === null) {
            $this->error('Le rôle « partner » n\'existe pas : lancer RolesAndPermissionsSeeder d\'abord.');

            return self::FAILURE;
        }

        $email = (string) env('PARTNER_DEMO_EMAIL', 'partenaire.demo@bogosland.com');
        $password = (string) ($this->option('password') ?: env('PARTNER_DEMO_PASSWORD', ''));
        $generated = $password === '';
        if ($generated) {
            $password = Str::password(16, symbols: false);
        }

        $partner = DB::transaction(function () use ($email, $password) {
            $user = User::query()->where('email', $email)->first();
            $attributes = [
                'name' => 'Riad Atlas',
                'password' => Hash::make($password),
                'role' => 'partner',
                'is_active' => true,
            ];
            if ($user === null) {
                $user = User::query()->create($attributes + ['email' => $email]);
                $this->info("Compte créé : {$email}");
            } else {
                $user->forceFill($attributes)->save();
                $this->info("Compte existant réinitialisé : {$email}");
            }
            $user->syncRoles(['partner']);

            $images = $this->publishImages();

            $partner = Partner::query()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => 'Riad Atlas',
                    'trade_name' => 'Riad Atlas Marrakech',
                    'legal_name' => 'Riad Atlas SARL',
                    'ice' => '001234567000089',
                    'contact_name' => 'Karim Benjelloun',
                    'phone' => '0612345678',
                    'email' => $email,
                    'address' => '12 derb Sidi Ahmed, Médina',
                    'city' => 'Marrakech',
                    'country' => 'Maroc',
                    'logo_url' => $images['logo'],
                    'notes' => 'Compte de démonstration — '.self::NOTE_MARKER,
                    'payment_holder_name' => 'Riad Atlas SARL',
                    'payment_bank_name' => 'Attijariwafa Bank',
                    'payment_iban' => 'MA64011519000001205000534921',
                    'payment_method_preference' => 'virement',
                    'status' => Partner::STATUS_ACTIVE,
                ],
            );

            $this->seedCommissions($partner);
            $this->seedShowcase($partner, $images);
            $this->seedClientsAndReservations($partner, $user);

            return $partner;
        });

        $token = app(PartnerQrService::class)->currentToken($partner);

        $this->info('Fiche partenaire, logo, vitrine QR, clients et réservations en place.');
        $this->line('Page publique du QR : '.app(PartnerQrService::class)->publicUrl($token->token));
        if ($generated) {
            $this->warn('Aucun PARTNER_DEMO_PASSWORD fourni — mot de passe généré (affiché une seule fois) :');
            $this->line("  {$password}");
        }

        return self::SUCCESS;
    }

    /**
     * Copie les images du dépôt vers le disque public et renvoie leurs URL,
     * dans la même forme que PartnerProfileController::updateLogo.
     *
     * @return array{logo: string, cover: string, hammam_pack: string, barber_pack: string}
     */
    private function publishImages(): array
    {
        $disk = Storage::disk('public');
        $disk->makeDirectory(self::IMAGE_DIR);

        $publish = function (string $file) use ($disk): string {
            $source = database_path('demo/partner/'.$file);
            if (! File::exists($source)) {
                throw new \RuntimeException("Image de démonstration introuvable : {$source}");
            }
            $disk->put(self::IMAGE_DIR.'/'.$file, File::get($source));

            return $disk->url(self::IMAGE_DIR.'/'.$file);
        };

        return [
            'logo' => $publish('demo-riad-atlas-logo.png'),
            'cover' => $publish('demo-riad-atlas-cover.jpg'),
            'hammam_pack' => $publish('pack-hammam-royal.jpg'),
            'barber_pack' => $publish('pack-barbier-prestige.jpg'),
        ];
    }

    private function seedCommissions(Partner $partner): void
    {
        $services = $this->servicesByName(array_keys(self::COMMISSIONS));

        foreach (self::COMMISSIONS as $name => [$type, $value]) {
            $service = $services->get($name);
            if ($service === null) {
                $this->warn("Service absent du catalogue, commission ignorée : {$name}");

                continue;
            }
            PartnerServiceCommission::query()->updateOrCreate(
                ['partner_id' => $partner->id, 'service_id' => $service->id],
                ['type' => $type, 'value' => $value],
            );
        }
    }

    /** @param array<string, string> $images */
    private function seedShowcase(Partner $partner, array $images): void
    {
        PartnerLandingSetting::query()->updateOrCreate(
            ['partner_id' => $partner->id],
            [
                'is_enabled' => true,
                'title' => 'Votre pause bien-être à Marrakech',
                'subtitle' => 'Offert par le Riad Atlas · Barbershop & Hammam Turc',
                'intro' => 'Réservez en quelques secondes un hammam, un soin ou une coupe chez BOGOS LAND, '
                    .'partenaire de votre riad.',
                'cover_image_url' => $images['cover'],
            ],
        );

        $services = $this->servicesByName([
            'Hammam royale', 'Massage sportif 60 min', 'Coupe cheveux + barbe', 'Rasage vapeur',
            'Soin visage vapeur 30 min', 'Hammam turc', 'Coupe simple', 'Barbe tracée',
        ]);

        // Les packs sont partagés avec le catalogue : on ne touche qu'aux
        // deux packs de démonstration, retrouvés par leur nom.
        $hammamPack = $this->pack('Pack Hammam Royal + Massage', 'Hammam royale suivi d\'un massage sportif d\'une heure.', $images['hammam_pack'], 600, [
            [$services->get('Hammam royale'), 1], [$services->get('Massage sportif 60 min'), 1],
        ]);
        $barberPack = $this->pack('Pack Barbier Prestige', 'Coupe, barbe et rasage vapeur pour un look impeccable.', $images['barber_pack'], 160, [
            [$services->get('Coupe cheveux + barbe'), 1], [$services->get('Rasage vapeur'), 1],
        ]);

        $order = 0;
        $offer = function (string $kind, ?int $targetId, array $extra = []) use ($partner, &$order): void {
            if ($targetId === null) {
                return;
            }
            $key = $kind === PartnerOffering::KIND_PACK ? 'service_pack_id' : 'service_id';
            PartnerOffering::query()->updateOrCreate(
                ['partner_id' => $partner->id, 'kind' => $kind, $key => $targetId],
                $extra + ['is_active' => true, 'sort_order' => $order++],
            );
        };

        $offer(PartnerOffering::KIND_PACK, $hammamPack?->id, [
            'is_featured' => true,
            'custom_title' => 'Pack Hammam Royal + Massage',
            'custom_description' => 'Notre formule signature, réservée aux clients du Riad Atlas.',
        ]);
        $offer(PartnerOffering::KIND_PACK, $barberPack?->id, ['is_featured' => true]);
        $offer(PartnerOffering::KIND_SERVICE, $services->get('Hammam turc')?->id, [
            'custom_description' => 'Gommage au savon noir et rinçage à l\'eau tiède.',
        ]);
        $offer(PartnerOffering::KIND_SERVICE, $services->get('Massage sportif 60 min')?->id);
        $offer(PartnerOffering::KIND_SERVICE, $services->get('Soin visage vapeur 30 min')?->id);
        $offer(PartnerOffering::KIND_SERVICE, $services->get('Coupe simple')?->id);
        $offer(PartnerOffering::KIND_SERVICE, $services->get('Barbe tracée')?->id);
    }

    /**
     * @param  array<int, array{0: ?Service, 1: int}>  $lines
     */
    private function pack(string $name, string $description, string $imageUrl, float $price, array $lines): ?ServicePack
    {
        $lines = array_filter($lines, fn (array $line) => $line[0] !== null);
        if ($lines === []) {
            $this->warn("Pack ignoré (services absents du catalogue) : {$name}");

            return null;
        }

        $pack = ServicePack::query()->updateOrCreate(
            ['name' => $name],
            ['description' => $description, 'image_url' => $imageUrl, 'price' => $price, 'is_active' => true],
        );

        $pack->items()->delete();
        foreach (array_values($lines) as $position => [$service, $quantity]) {
            ServicePackItem::query()->create([
                'service_pack_id' => $pack->id,
                'service_id' => $service->id,
                'quantity' => $quantity,
                'sort_order' => $position,
            ]);
        }

        return $pack;
    }

    private function seedClientsAndReservations(Partner $partner, User $user): void
    {
        $clients = [];
        foreach ([
            ['Yassine El Amrani', '0600000101', '#4C7CC8'],
            ['Sophie Martin', '0600000102', '#C8794C'],
            ['Hamza Benali', '0600000103', '#4CC88A'],
            ['Laura Schmidt', '0600000104', '#A64CC8'],
            ['Omar Idrissi', '0600000105', '#C8B84C'],
        ] as $index => [$name, $phone, $color]) {
            $clients[] = Client::query()->updateOrCreate(
                ['partner_id' => $partner->id, 'phone_e164' => PhoneNumberNormalizer::toE164($phone)],
                [
                    'name' => $name,
                    'phone' => $phone,
                    'avatar_color' => $color,
                    'created_by_user_id' => $user->id,
                    'registered_at' => now()->subDays(20 - $index),
                    'notes' => self::NOTE_MARKER,
                ],
            );
        }

        // Les réservations sont recréées à chaque exécution pour rester dans
        // le futur ; seules celles marquées démo de CE partenaire sont purgées.
        Appointment::query()
            ->where('partner_id', $partner->id)
            ->where('notes', 'like', self::NOTE_MARKER.'%')
            ->delete();

        $services = $this->servicesByName([
            'Hammam royale', 'Massage sportif 60 min', 'Coupe cheveux + barbe', 'Hammam turc', 'Rasage vapeur', 'Soin visage vapeur 30 min',
        ]);

        // [client, jours depuis aujourd'hui, heure, service, statut, source]
        $plan = [
            [0, 1, '11:00', 'Hammam royale', 'confirmed', Appointment::SOURCE_PARTNER],
            [1, 1, '15:30', 'Massage sportif 60 min', 'pending', Appointment::SOURCE_PARTNER_QR],
            [2, 2, '17:00', 'Coupe cheveux + barbe', 'confirmed', Appointment::SOURCE_PARTNER],
            [3, 3, '12:00', 'Hammam turc', 'pending', Appointment::SOURCE_PARTNER_QR],
            [4, 5, '19:00', 'Rasage vapeur', 'confirmed', Appointment::SOURCE_PARTNER],
            [0, -3, '14:00', 'Soin visage vapeur 30 min', 'completed', Appointment::SOURCE_PARTNER],
            [2, -6, '18:00', 'Hammam turc', 'completed', Appointment::SOURCE_PARTNER_QR],
            [1, -9, '16:00', 'Coupe cheveux + barbe', 'cancelled', Appointment::SOURCE_PARTNER],
        ];

        foreach ($plan as [$clientIndex, $dayOffset, $time, $serviceName, $status, $source]) {
            $service = $services->get($serviceName);
            if ($service === null) {
                continue;
            }
            // Heure murale naïve : l'agenda stocke l'heure du salon sans fuseau.
            $startsAt = Carbon::parse(now()->addDays($dayOffset)->toDateString().' '.$time);

            Appointment::query()->create([
                'client_id' => $clients[$clientIndex]->id,
                'client_ids' => [$clients[$clientIndex]->id],
                'partner_id' => $partner->id,
                'service_id' => $service->id,
                'starts_at' => $startsAt,
                'ends_at' => $startsAt->copy()->addMinutes((int) $service->duration_minutes),
                'status' => $status,
                'source' => $source,
                'notes' => self::NOTE_MARKER.' Réservation de démonstration',
                'reservation_items' => [[
                    'uid' => Str::random(12),
                    'service_id' => $service->id,
                    'employee_id' => null,
                    'person_index' => 0,
                    'price_snapshot' => (float) $service->price,
                    'commission_snapshot' => $partner->load('commissions')->commissionFor($service->id, (float) $service->price),
                    'duration_minutes_snapshot' => (int) $service->duration_minutes,
                ]],
                'people' => [['name' => null]],
                'created_by_user_id' => $source === Appointment::SOURCE_PARTNER ? $user->id : null,
                'cancelled_at' => $status === 'cancelled' ? $startsAt->copy()->subDay() : null,
                'cancellation_reason' => $status === 'cancelled' ? 'Annulée par le client (démo)' : null,
            ]);
        }
    }

    /**
     * @param  array<int, string>  $names
     * @return \Illuminate\Support\Collection<string, Service>
     */
    private function servicesByName(array $names)
    {
        return Service::query()->whereIn('name', $names)->get()->keyBy('name');
    }
}
