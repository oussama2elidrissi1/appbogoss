# Fidélité & Abonnements — Rapport de livraison

Rapport final du module « Fidélité & Abonnements » de BOGOSLAND Manager, structuré selon la demande initiale (spécification en 41 sections). Aucune donnée réelle n'a été supprimée ou altérée destructivement — toutes les migrations sont additives, `migrate:fresh` n'a jamais été exécuté.

## 1. Statut global

**Backend : complet et testé (167/167 tests, 617 assertions).**
**Frontend : QR admin, inscription publique, portail client livrés et vérifiés en conditions réelles (Playwright). Trois pages admin restent à construire — voir §9 « Livré / non livré ».**

**Authentification client : phone + mot de passe choisi par le client, pas d'OTP/SMS/email** (changement demandé après la première livraison de ce module — voir §8).

## 2. Fonctionnalités implémentées

- Moteur de fidélité (programmes service_count / points / amount_spent / visit_count / birthday / custom), déjà en place avant cette session, conservé intact.
- QR Code général d'inscription : génération, régénération (invalide l'ancien), activation/désactivation, page admin avec export PNG et affiche imprimable A4.
- Inscription publique `/join` : formulaire, déduplication par téléphone normalisé E.164, consentement CGU/marketing, mot de passe choisi par le client (hashé, jamais stocké/renvoyé en clair) — l'inscription établit directement la session portail, sans étape de vérification séparée.
- Connexion des clients récurrents par téléphone + mot de passe (`POST /api/public/login`), message d'erreur générique (ne révèle jamais si un numéro correspond à un compte existant), verrouillage après 5 échecs sur un même numéro.
- Portail client « Mon BOGOSLAND » (`/mon-compte`) : Accueil (points, prochaine récompense, alertes, abonnements actifs), Mes récompenses (disponibles/utilisées/expirées), Mes abonnements (quotas restants par service). Guard Laravel dédié (`client`), totalement indépendant de la session staff.
- Identification client en caisse par QR personnel (token opaque, révocable, jamais de donnée sensible dans l'URL).
- Corrections manuelles Super Admin (ajustement de progression, octroi/annulation de récompense) — motif obligatoire, entièrement journalisées.
- Cycle de vie complet des abonnements : achat, utilisation avec quota, suspension (gèle la date de fin), reprise, renouvellement (préserve l'historique via `renewed_from_id`), expiration automatique.
- Segments marketing en lecture seule, tous filtrés sur `consent_marketing_at IS NOT NULL`.
- Notifications multi-canal (11 événements), gabarits par défaut modifiables via un blob JSON de paramètres, échecs d'envoi journalisés sans jamais faire échouer la transaction de paiement associée.
- Journal d'activité étendu (`client_id` nullable) pour capturer les actions initiées par un client, pas seulement par le staff.
- Permissions granulaires (18 permissions dédiées) au niveau Gate/Policy/Middleware, pas seulement en façade frontend.
- Tâche planifiée quotidienne unique (`loyalty:sweep`) couvrant sept opérations (voir §6).

## 3. Fichiers créés / modifiés

### Migrations (8, toutes additives)
```
2026_08_07_090000_add_portal_columns_to_clients_table.php
2026_08_07_090001_add_loyalty_number_to_customer_loyalty_accounts_table.php
2026_08_07_090002_create_customer_otp_codes_table.php
2026_08_07_090003_create_client_qr_tokens_table.php
2026_08_07_090004_add_lifecycle_columns_to_subscriptions_tables.php
2026_08_07_090005_add_stacking_columns_to_loyalty_programs_table.php
2026_08_07_090006_add_client_id_to_activity_logs_table.php
2026_08_07_190520_add_password_to_clients_table.php
```

### Modèles
Nouveaux : `CustomerOtpCode`, `ClientQrToken`.
Modifiés : `Client` (guard `Authenticatable` + `Notifiable`, `password` hidden + cast `hashed`), `CustomerLoyaltyAccount` (`loyalty_number`), `LoyaltyProgram` (stacking/priority), `SubscriptionPlan` (suspension/renouvellement), `ClientSubscription` (statut `suspended`, `renewed_from_id`), `ActivityLog` (`client_id`).

### Services
Nouveaux : `PhoneNumberNormalizer`, `LoyaltySettingsService`, `Otp/OtpProviderInterface`, `Otp/LogOtpProvider`, `Otp/OtpService`, `CustomerRegistrationService`, `LoyaltyNotifier`.
Modifiés : `LoyaltyEngine` (+ `expireDueRewards`, `notifyExpiringRewards`, corrections manuelles), `RewardRedemptionService` (réservation atomique anti-course), `SubscriptionService` (+ suspend/resume/extend/renew/notifyExpiringSubscriptions, correction de fuseau horaire), `ActivityLogger` (capture `client_id`, **correctif** : `user_id` utilise désormais explicitement `Auth::guard('web')->id()` au lieu de `Auth::id()` — sous `auth:client`, le guard par défaut est repointé vers `client` et `Auth::id()` renvoyait l'id du client, violant la clé étrangère `users` ; bug latent préexistant, jamais déclenché avant qu'un test n'exerce `POST /api/client/logout`).

### Contrôleurs
Nouveaux : `Public/JoinController`, `Public/ClientLoginController`, `Portal/PortalController`, `Portal/PortalLoyaltyController`, `Portal/PortalPrestationsController`, `LoyaltySettingsController`, `LoyaltyQrController`, `ClientQrController`, `ClientLoyaltyAdjustmentController`, `ClientSubscriptionLifecycleController`, `LoyaltyDashboardController`, `LoyaltyReportController`, `MarketingSegmentController`.
Modifiés : `ActivityLogController`, `ActivityLogResource`.
**Non routé (conservé, pas supprimé)** : `Public/OtpController` — l'infrastructure OTP (`OtpService`, `CustomerOtpCode`, `LogOtpProvider`) reste en place, inutilisée par l'inscription/connexion, gardée intentionnellement comme base toute prête pour un futur flux « mot de passe oublié » (voir §8).

### Notifications
Nouveau : `LoyaltyNotification` (générique, paramétrée par événement).

### Frontend
Nouveaux : `pages/LoyaltyQr.tsx`, `pages/LoyaltySettings.tsx`, `pages/Join.tsx`, `pages/portal/{PortalLayout,PortalLogin,PortalHome,PortalRewards,PortalSubscriptions}.tsx`, `hooks/usePortalAuth.tsx`, `types/portal.ts`.
Modifiés : `App.tsx` (routes), `main.tsx` (`PortalAuthProvider`), `lib/api.ts` (endpoints QR/paramètres/join/OTP/portail), `lib/navigation.ts` (entrées « QR Code » et « Paramètres fidélité »), `types/loyalty.ts`.

### Tests
Nouveaux : `CustomerPortalAuthTest`, `CustomerPortalSecurityTest`, `CustomerRegistrationAndAuthTest` (dédup, hash de mot de passe, anti-prise-de-compte, connexion/verrouillage), `OtpServiceTest` (garde l'infra OTP non routée sous test).
Étendus : `LoyaltyEngineTest` (scénario 11 achats), `LoyaltyRedemptionWorkflowTest` (concurrence), `SweepLoyaltyProgramsCommandTest` (expiration récompenses, alertes, purge OTP).

### Config
`config/auth.php` (guard `client` + provider `clients`), `AppServiceProvider` (binding `OtpProviderInterface`), `RouteServiceProvider` (limiteur `otp`, 10/min/IP).

## 4. Tables utilisées

Nouvelles : `customer_otp_codes`, `client_qr_tokens`.
Étendues : `clients`, `customer_loyalty_accounts`, `loyalty_programs`, `subscription_plans`, `client_subscriptions`, `activity_logs`.
Réutilisées sans modification de schéma : `app_settings` (tous les réglages `loyalty_*`/`otp_*`), `notifications` (table native Laravel).

**Aucune table `loyalty_cards` / `customer_cards` n'existe — vérifié par recherche exhaustive dans `app/`, `database/`, `resources/js/` : zéro résultat.** Le compte fidélité reste exclusivement numérique (`customer_loyalty_accounts` + `loyalty_number` séquentiel `FID-{année}-{000123}`).

## 5. Routes API

**Publiques (`throttle:otp`, 10/min/IP, sans authentification) :**
```
GET  /api/public/join/status
POST /api/public/join     (inscription — établit directement la session)
POST /api/public/login    (connexion téléphone + mot de passe)
```
Le nom `otp` du limiteur est un résidu de la précédente implémentation — la forme (10/min/IP) reste correcte pour ces deux routes, seul le nom prête à confusion (non renommé pour limiter le diff de cette correction).

**Portail client (`auth:client`, guard dédié, aucune permission spatie) :**
```
GET|PUT /api/client/me
POST    /api/client/logout
GET     /api/client/home
GET     /api/client/loyalty
GET     /api/client/rewards
GET     /api/client/subscriptions
GET     /api/client/prestations
GET     /api/client/notifications (+ read/read-all)
```

**Staff (`auth:sanctum` + permission dédiée) :**
```
loyalty.manage         → CRUD loyalty-programs, subscription-plans
loyalty.redeem         → POST /api/qr/lookup, GET /api/clients/{client}/loyalty-status
loyalty.view            → GET /api/loyalty/dashboard
loyalty.reports.view    → GET /api/loyalty/reports/{report}
loyalty.settings.manage → GET/PUT /api/loyalty/settings
loyalty.qr.manage       → GET /api/loyalty/qr, POST /api/loyalty/qr/regenerate
loyalty.redeem          → /api/clients/{client}/qr (show/regenerate/revoke)
loyalty.rewards.adjust  → ajustement progression, octroi/annulation récompense
subscriptions.suspend / .extend → suspend/resume/extend/renew d'un abonnement
loyalty.view            → GET /api/marketing/segments (+ /{segment})
```

Vérifié via `php artisan route:list --path=api` — aucun conflit.

## 6. Tâche planifiée (`loyalty:sweep`, quotidienne 02:00, `app/Console/Kernel.php`)

1. Récompenses anniversaire (programmes `birthday`).
2. Programmes personnalisés (`custom`).
3. Expiration des récompenses dépassant `expires_at` (nouveau).
4. Expiration des abonnements dépassant `ends_on`.
5. Alertes d'expiration d'abonnement (`subscription_expiry_alert_days`, dédupliquées par jour via ActivityLog).
6. Alertes d'expiration de récompense (même mécanisme, nouveau).
7. Purge des codes OTP consommés/expirés depuis plus de 24h (nouveau).

## 7. Permissions par rôle

| Permission | Super Admin | Admin/Caissier | Employé |
|---|---|---|---|
| `loyalty.manage`, `loyalty.redeem` | ✅ | ✅ | `loyalty.redeem` seul |
| `loyalty.qr.manage`, `loyalty.reports.view` | ✅ | ✅ | ❌ |
| `loyalty.view` (dashboard, segments) | ✅ | ✅ | ❌ |
| `loyalty.settings.manage` | ✅ | ❌ | ❌ |
| `loyalty.rewards.adjust` (corrections manuelles) | ✅ | ❌ | ❌ |
| `subscriptions.suspend` / `.extend` | ✅ | ❌ | ❌ |
| `loyalty.override_quota` | ✅ | ❌ | ❌ |

Confirmé en lisant directement `database/seeders/RolesAndPermissionsSeeder.php` (pas de mémoire) — l'admin a bien `loyalty.qr.manage`, donc l'entrée de menu « QR Code » lui est visible.

## 8. Authentification client — phone + mot de passe (pas d'OTP/SMS/email)

Décision prise en cours de session : l'inscription/connexion client n'utilise **plus** d'OTP par SMS/email. Le client crée son compte avec son numéro de téléphone et un mot de passe de son choix (8 caractères minimum, confirmation requise) ; les visites suivantes se font par téléphone + mot de passe (`/mon-compte/connexion`).

- **Inscription** (`POST /api/public/join`) : établit directement la session — pas d'étape de vérification séparée. Si le téléphone correspond déjà à un compte existant, la requête est rejetée (422, « Un compte existe déjà pour ce numéro ») **sans jamais connecter l'appelant** — sinon n'importe qui pourrait prendre le contrôle d'un compte existant en resoumettant le formulaire avec un numéro qu'il ne possède pas. Testé explicitement (`CustomerRegistrationAndAuthTest`).
- **Connexion** (`POST /api/public/login`) : message d'erreur générique (« Numéro ou mot de passe incorrect ») que l'échec vienne d'un numéro inconnu ou d'un mauvais mot de passe — un message distinct aurait permis d'énumérer quels numéros sont clients. Verrouillage après 5 échecs sur un même numéro (`RateLimiter`, 5 minutes), en plus du throttle IP au niveau route.
- Mot de passe stocké hashé (`Client::$casts['password'] = 'hashed'`), jamais renvoyé par l'API (`$hidden`).

**Ce qui n'existe pas encore : « mot de passe oublié ».** Aucune demande explicite pour cette session, mais un client qui oublie son mot de passe n'a aujourd'hui aucun moyen de le réinitialiser lui-même — variable à trancher pour la mise en production réelle.

**Infrastructure OTP conservée, non branchée.** `OtpService`, `CustomerOtpCode`, `OtpProviderInterface`/`LogOtpProvider` et leurs tests (`OtpServiceTest`) restent dans le code, simplement déconnectés des routes d'inscription/connexion (`Public/OtpController` n'est plus routé). C'est délibéré : un flux « mot de passe oublié » est structurellement un flux OTP (envoyer un code au téléphone, le vérifier, puis autoriser un changement de mot de passe) — cette infrastructure est prête à être réutilisée telle quelle plutôt que reconstruite. `LogOtpProvider` écrit toujours le code dans `storage/logs/laravel.log` en mode démo ; un vrai provider SMS (Twilio, Vonage, etc.) resterait à implémenter avant un usage réel de ce flux.

## 9. Livré / non livré

**Livré et vérifié (backend + frontend, testé en navigateur réel) :**
- QR Code admin (`/loyalty-qr`, permission `loyalty.qr.manage`) — affiche imprimable A4 redessinée (cadre doré, coins ornementaux, message dans un encart dédié) avec un choix de langue (français / arabe / les deux) réglable dans Fidélité → Paramètres (`loyalty_qr_poster_language`) ; le texte libre du message reste toujours celui saisi par l'admin. Vérifié visuellement dans les 3 configurations (rendu RTL correct en arabe).
- Inscription publique (`/join`, téléphone + mot de passe) + connexion retour (`/mon-compte/connexion`) + session portail — flux complet vérifié en navigateur réel (inscription → portail → déconnexion → reconnexion par mot de passe).
- Portail client : Accueil, Mes récompenses, Mes abonnements
- **Fidélité → Paramètres** (`/loyalty-settings`, permission `loyalty.settings.manage`, Super Admin uniquement — vérifié qu'un compte `admin` en est bien exclu et redirigé). Général, QR & inscription, OTP, Récompenses & abonnements, Notifications par événement (activer/désactiver + copie email). Testé en navigateur réel : sauvegarde, rechargement, valeur persistée confirmés.

**Backend complet et testé, frontend non construit (à prioriser dans cet ordre) :**
1. **Fidélité → Tableau de bord** — `GET /api/loyalty/dashboard`, permission `loyalty.view`.
2. **Fidélité → Rapports** — `GET /api/loyalty/reports/{report}` (5 rapports + export CSV), permission `loyalty.reports.view`.
3. **Fiche client → onglet Fidélité** — ajustements manuels (`loyalty.rewards.adjust`), suspend/resume/extend/renew (`subscriptions.suspend`/`.extend`).

Aucune de ces trois pages n'a d'entrée de menu pointant vers un écran inexistant — elles ne sont simplement pas encore dans `App.tsx`.

## 10. Tests automatisés

**167 tests / 617 assertions, tous verts** (`php artisan test`).

Scénarios §36 couverts explicitement cette session :
- 11 achats avec report → exactement 2 récompenses générées + 1/5 restant (`LoyaltyEngineTest`).
- Concurrence sur une même récompense disponible → une seule réservation réussit (`LoyaltyRedemptionWorkflowTest`).
- Déduplication par téléphone normalisé (0612345678 / +212612345678 / 212612345678 / avec espaces → même client, jamais de doublon).
- Mot de passe stocké hashé et vérifiable, jamais en clair.
- Inscription sur un numéro déjà existant → rejetée (422), aucune session établie pour l'appelant (test explicite de l'anti-prise-de-compte, §31).
- Connexion : numéro inconnu et mauvais mot de passe renvoient le même message générique ; verrouillage après 5 échecs sur un même numéro.
- OTP (infrastructure conservée, non routée) : code faux, expiré, déjà consommé, verrouillage, cooldown — toujours testé pour éviter qu'elle ne pourrisse en silence avant un futur usage « mot de passe oublié ».
- Sécurité portail : le compte A ne voit jamais les données du compte B (accueil, récompenses).
- QR personnel révoqué/inconnu rejeté ; QR valide résolu correctement.
- Employé sans `loyalty.redeem` bloqué sur le scan QR.
- Inscription refusée si token invalide ou inscriptions désactivées.
- Flux HTTP réel bout en bout (join → session cookie → accès portail ; déconnexion → reconnexion par mot de passe) sans bypass d'authentification.

**Non exécuté : les scénarios Playwright A–E de la spécification.** Les invariants qu'ils viseraient (génération de récompense au 5ᵉ achat, flux complet caisse+commission, application du quota hebdomadaire, reflet en temps réel côté portail) sont déjà couverts au niveau service/HTTP par les tests ci-dessus et par la suite Phase 1 existante ; le flux d'inscription/connexion complet, lui, **a** été rejoué en navigateur réel (voir §9).

## 11. Build & Typecheck

- `npm run typecheck` → **0 erreur.**
- `npm run build` → **succès.** Avertissement pré-existant : un chunk de ~1,7 Mo (`main-*.js`) dépasse le seuil de 500 Ko — présent avant cette session, non aggravé de façon notable, non corrigé (découpage en chunks hors périmètre de cette tâche).
- **Pint / ESLint** : `laravel/pint` est une dépendance de dev mais n'est configuré nulle part (pas de `pint.json`, pas de hook, pas de CI) — `vendor/bin/pint --test` signale des écarts sur ~60 fichiers dont la quasi-totalité n'a pas été touchée cette session (contrôleurs/services/tests préexistants). Le nouveau code suit les conventions déjà en usage dans le projet ; Pint n'a pas été exécuté en écriture pour éviter un reformatage de masse hors périmètre. Aucun fichier `.eslintrc`/`eslint.config.*` n'existe côté frontend.
- Recherche de `console.log`/`dd()`/`dump()`/OTP en dur/secrets exposés dans tous les fichiers créés cette session : **aucun résultat.**

## 12. Données de démonstration

`database/seeders/LoyaltyAndSubscriptionSeeder.php` — **idempotent, vérifié sur 3 exécutions consécutives** (sélection déterministe par `id`, pas aléatoire — un bug d'idempotence a été détecté et corrigé pendant cette session : la sélection aléatoire précédente pouvait réassigner le numéro de téléphone démo fixe à un client différent à chaque rejeu et violer la contrainte d'unicité).

11 scénarios sur 11 clients déterministes : 4/5 en cours, récompense disponible, récompense utilisée (historique), abonnement actif, abonnement expiré, progression points partielle (320/500), récompense expirant dans 3 jours, abonnement expirant dans 4 jours, abonnement suspendu, anniversaire cette semaine, **compte portail entièrement prêt : téléphone `+212600000001` / mot de passe `Bogosland2026!`, connectable immédiatement via `/mon-compte/connexion`**.

**⚠️ Seeder de démonstration — ne jamais l'exécuter en production.** Il modifie des colonnes (`phone_e164`, `birth_date`, `consent_*`) sur des clients existants pour construire ses scénarios. Sur cet environnement de développement (peuplé de 40 clients factices par `DemoDataSeeder`), c'est sans risque ; sur une base contenant de vrais clients, ce serait une écriture destructive sur de vraies fiches client.

## 13. Commandes de déploiement (production)

```bash
# 1. Code
git pull

# 2. Backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan permission:cache-reset

# 3. Frontend
npm ci
npm run build

# 4. Cache
php artisan optimize:clear
php artisan optimize

# NE JAMAIS exécuter en production :
#   php artisan migrate:fresh
#   php artisan db:seed --class=LoyaltyAndSubscriptionSeeder   (données de démo, voir §12)
```

## 14. Variables `.env` à vérifier/ajouter

- `SANCTUM_STATEFUL_DOMAINS=app.bogosland.com` — **recommandé explicitement**, même si non strictement requis : Sanctum déduit un domaine stateful par défaut à partir de `APP_URL`, donc ça fonctionne déjà si `APP_URL=https://app.bogosland.com` est correctement positionné en production. Le fixer explicitement évite qu'un `APP_URL` mal configuré ne fasse échouer silencieusement tout le portail (401 sur `/api/client/*`) sans piste de diagnostic évidente.
- Aucune autre variable d'environnement nouvelle n'est requise (OTP/QR/notifications sont tous pilotés depuis `app_settings`, pas depuis `.env`).

## 15. Procédure de test manuel (staff)

1. Se connecter en admin → **Fidélité → QR Code** → vérifier que le QR s'affiche, télécharger le PNG, imprimer l'affiche.
2. Scanner (ou copier) le lien `/join?t=...` dans un navigateur privé.
3. Remplir le formulaire d'inscription (nom, téléphone, mot de passe + confirmation) → arriver directement sur `/mon-compte` (Accueil) — pas d'étape de vérification intermédiaire.
4. Naviguer Récompenses / Abonnements.
5. Se déconnecter, revenir sur `/mon-compte/connexion`, se reconnecter avec le même téléphone + mot de passe → confirmer le retour sur `/mon-compte`.
6. Se reconnecter en staff → **Clients** → vérifier le client nouvellement inscrit.
7. Encaisser 5 prestations « hammam » pour ce client → vérifier qu'une récompense apparaît (base de données ou, une fois construite, l'onglet Fidélité de la fiche client).
8. Se connecter côté client avec `+212600000001` / `Bogosland2026!` (compte de démo, voir §12) pour observer un compte déjà riche en historique.

## 16. Comptes de démonstration

- **Staff** : `admin@bogosland.com` / `password` (voir écran de connexion).
- **Client portail** : téléphone `+212600000001` / mot de passe `Bogosland2026!`.
