<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * QR PARTENAIRE — la vitrine publique d'un partenaire et l'attribution de ce
 * qu'elle rapporte.
 *
 * Rien ici ne double un systeme existant : le partenaire reste `partners`, la
 * reservation reste `appointments` (qui porte deja `partner_id` et `source`),
 * la commission reste `partner_commissions`, et les prestations proposees
 * pointent vers le catalogue `services` — jamais une copie.
 *
 * Cinq tables, chacune pour une raison precise :
 *
 *  - `partner_qr_tokens` : meme patron que `client_qr_tokens` — un token
 *    opaque par partenaire, revoque-et-remplace, l'ancien garde sa trace. Il
 *    n'y a JAMAIS d'id de partenaire dans l'URL publique.
 *  - `service_packs` / `service_pack_items` : un pack est un assemblage de
 *    services du catalogue, avec son propre prix. Les services ne sont pas
 *    dupliques, seulement references.
 *  - `partner_offerings` : ce que CE partenaire montre. Une ligne cible un
 *    service OU un pack, avec ses surcharges (prix, commission, titre, dates,
 *    mise en avant). Deux partenaires ne se voient jamais.
 *  - `partner_landing_settings` : l'habillage de la page, un enregistrement
 *    par partenaire, cree a la demande. Table dediee plutot que cinq colonnes
 *    de plus sur `partners`, qui n'a rien a voir avec une page publique.
 *  - `partner_qr_visits` : une ligne par VISITE, pas par rafraichissement —
 *    une empreinte de session anonyme tient lieu de cle, et la conversion
 *    vient s'y accrocher quand la reservation est prise.
 */
return new class extends Migration
{
    public function up(): void
    {
        // -------------------------------------------------------- le token
        Schema::create('partner_qr_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained('partners')->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            // La recherche qui compte : « le token actif de ce partenaire ».
            $table->index(['partner_id', 'revoked_at']);
        });

        // --------------------------------------------------------- les packs
        Schema::create('service_packs', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('image_url')->nullable();
            $table->decimal('price', 10, 2);
            // Prix barre : quand il est renseigne, c'est LUI qui est paye et
            // `price` devient le prix de reference affiche barre.
            $table->decimal('promotional_price', 10, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('service_pack_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_pack_id')->constrained('service_packs')->cascadeOnDelete();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            // Un service ne figure qu'une fois dans un pack : sa quantite dit
            // le reste, et l'unicite empeche les doublons a la re-sauvegarde.
            $table->unique(['service_pack_id', 'service_id']);
        });

        // ------------------------------------------------------ les offres
        Schema::create('partner_offerings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained('partners')->cascadeOnDelete();
            // 'service' | 'pack' — deux colonnes nullables plutot qu'un
            // morphTo : les deux cibles sont connues, fermees, et des cles
            // etrangeres reelles valent mieux qu'un `*_type` en texte libre.
            $table->string('kind', 16);
            $table->foreignId('service_id')->nullable()->constrained('services')->cascadeOnDelete();
            $table->foreignId('service_pack_id')->nullable()->constrained('service_packs')->cascadeOnDelete();

            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->unsignedInteger('sort_order')->default(0);

            // Surcharges, toutes facultatives : nul = on prend la valeur du
            // catalogue ou la grille de commission habituelle.
            $table->decimal('custom_price', 10, 2)->nullable();
            $table->string('custom_commission_type', 16)->nullable(); // percentage | fixed
            $table->decimal('custom_commission_value', 10, 2)->nullable();
            $table->string('custom_title')->nullable();
            $table->text('custom_description')->nullable();

            $table->date('available_from')->nullable();
            $table->date('available_until')->nullable();

            $table->timestamps();

            $table->index(['partner_id', 'is_active', 'sort_order']);
            // Le meme service ne peut pas figurer deux fois dans la vitrine du
            // meme partenaire. MySQL laisse passer les NULL multiples, donc
            // l'unicite ne mord que sur la colonne reellement renseignee.
            $table->unique(['partner_id', 'service_id']);
            $table->unique(['partner_id', 'service_pack_id']);
        });

        // ------------------------------------------------- la page publique
        Schema::create('partner_landing_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->unique()->constrained('partners')->cascadeOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->string('title')->nullable();
            $table->string('subtitle')->nullable();
            $table->text('intro')->nullable();
            $table->string('cover_image_url')->nullable();
            $table->timestamps();
        });

        // ---------------------------------------------------- le tracking
        Schema::create('partner_qr_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained('partners')->cascadeOnDelete();
            $table->foreignId('partner_qr_token_id')->nullable()
                ->constrained('partner_qr_tokens')->nullOnDelete();
            // Empreinte anonyme et non reversible d'une session (voir
            // PartnerQrService::visitorKey) : aucune IP, aucun agent stockes
            // en clair. C'est elle qui empeche un rafraichissement de compter
            // comme un second scan.
            $table->string('visitor_key', 64);
            $table->unsignedInteger('hits')->default(1);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            // La conversion : remplie quand CETTE visite aboutit a une
            // reservation. Une visite ne convertit qu'une fois.
            $table->foreignId('appointment_id')->nullable()
                ->constrained('appointments')->nullOnDelete();
            $table->timestamp('converted_at')->nullable();
            $table->timestamps();

            // Une visite par session et par partenaire : c'est la cle du
            // comptage, et elle rend l'increment idempotent.
            $table->unique(['partner_id', 'visitor_key']);
            $table->index(['partner_id', 'first_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_qr_visits');
        Schema::dropIfExists('partner_landing_settings');
        Schema::dropIfExists('partner_offerings');
        Schema::dropIfExists('service_pack_items');
        Schema::dropIfExists('service_packs');
        Schema::dropIfExists('partner_qr_tokens');
    }
};
