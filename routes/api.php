<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AdvanceController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashMovementController;
use App\Http\Controllers\Api\ClientAccountController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ClientLoyaltyAdjustmentController;
use App\Http\Controllers\Api\ClientLoyaltyStatusController;
use App\Http\Controllers\Api\ClientQrController;
use App\Http\Controllers\Api\ClientSubscriptionLifecycleController;
use App\Http\Controllers\Api\CommissionPayoutController;
use App\Http\Controllers\Api\CommissionRegularizationController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeServiceCommissionController;
use App\Http\Controllers\Api\EmployeeWorkspaceController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\LoyaltyDashboardController;
use App\Http\Controllers\Api\LoyaltyProgramController;
use App\Http\Controllers\Api\LoyaltyQrController;
use App\Http\Controllers\Api\LoyaltyReportController;
use App\Http\Controllers\Api\LoyaltySettingsController;
use App\Http\Controllers\Api\MarketingSegmentController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\Mobile\MobileAuthController;
use App\Http\Controllers\Api\Mobile\MobileClientAuthController;
use App\Http\Controllers\Api\MonthlyClosureController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\Partner\PartnerClientController;
use App\Http\Controllers\Api\Partner\PartnerCommissionController as PartnerPortalCommissionController;
use App\Http\Controllers\Api\Partner\PartnerDashboardController;
use App\Http\Controllers\Api\Partner\PartnerProfileController;
use App\Http\Controllers\Api\Partner\PartnerServiceController as PartnerPortalServiceController;
use App\Http\Controllers\Api\Partner\PartnerSupportController;
use App\Http\Controllers\Api\PartnerCommissionPayoutController;
use App\Http\Controllers\Api\PartnerController;
use App\Http\Controllers\Api\Portal\PortalController;
use App\Http\Controllers\Api\Portal\PortalLoyaltyController;
use App\Http\Controllers\Api\Portal\PortalPrestationsController;
use App\Http\Controllers\Api\Portal\PortalQrController;
use App\Http\Controllers\Api\PosV2\PosAppointmentController;
use App\Http\Controllers\Api\PosV2\PosCheckoutController;
use App\Http\Controllers\Api\PosV2\PosClientContextController;
use App\Http\Controllers\Api\PosV2\PosDashboardController;
use App\Http\Controllers\Api\PosV2\PosHistoryController;
use App\Http\Controllers\Api\PosV2\PosInvoiceController;
use App\Http\Controllers\Api\PosV2\PosPendingController;
use App\Http\Controllers\Api\PosV2\PosQrController;
use App\Http\Controllers\Api\PosV2\PosSubscriptionPaymentController;
use App\Http\Controllers\Api\PrestationController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\Public\ClientLoginController;
use App\Http\Controllers\Api\Public\JoinController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SubscriptionAdminController;
use App\Http\Controllers\Api\SubscriptionPlanController;
use App\Http\Controllers\Api\SubscriptionPurchaseController;
use App\Http\Controllers\Api\SubscriptionScanController;
use App\Http\Controllers\Api\SupportInboxController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkDayController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

Route::post('/login', [AuthController::class, 'login']);

// Public, unauthenticated customer-facing surface — QR self-registration
// and phone+password auth. No spatie permission applies here (there is no
// staff user), gated instead by the loyalty_qr_registration_enabled
// setting/token and a coarse IP-based throttle (see RouteServiceProvider's
// 'otp' limiter — name predates this route, still the right shape/limits).
// Note: App\Services\Otp\* and the /api/public/otp/* routes it used to power
// are unwired but intentionally kept (not deleted) — the exact same
// infrastructure is what a future "mot de passe oublié" reset flow needs.
Route::middleware('throttle:otp')->prefix('public')->group(function () {
    Route::get('/join/status', [JoinController::class, 'status']);
    Route::post('/join', [JoinController::class, 'register']);
    Route::post('/login', [ClientLoginController::class, 'login']);
});

// Mobile (Flutter) authentication. Additive surface: it mints Sanctum
// personal access tokens, where /api/login above establishes a cookie session
// and returns none. Everything past login reuses the existing endpoints —
// `auth:sanctum` already resolves a bearer token into the same User the
// session guard produces, so permissions/policies apply unchanged.
Route::prefix('mobile')->group(function () {
    Route::middleware('throttle:mobile-login')->group(function () {
        Route::post('/login', [MobileAuthController::class, 'login']);
        Route::post('/client/login', [MobileClientAuthController::class, 'login']);
    });

    // Both guards, staff first. A client token fails `sanctum` on the provider
    // check (config/auth.php) and falls through to `client-api`.
    Route::middleware('auth:sanctum,client-api')->group(function () {
        Route::get('/me', [MobileAuthController::class, 'me']);
        Route::post('/logout', [MobileAuthController::class, 'logout']);
    });
});

// Customer portal ("Mon BOGOSLAND") — separate `client` guard, no spatie
// permissions (a Client isn't staff, see AuthServiceProvider's
// Gate::before which only special-cases super-admin Users).
//
// `client-api` is the token twin of `client`, added for the mobile app; the
// cookie guard stays first so the web portal resolves exactly as before.
// `client.account` is NOT optional here: Sanctum's Guard consults the global
// config('sanctum.guard') (['web']) before the bearer token, so a staff
// browser session would otherwise satisfy `client-api` and be handed to these
// controllers as a customer. See App\Http\Middleware\EnsureClientAccount.
Route::middleware(['auth:client,client-api', 'client.account'])->prefix('client')->group(function () {
    Route::get('/me', [PortalController::class, 'me']);
    Route::put('/me', [PortalController::class, 'updateProfile']);
    Route::post('/logout', [PortalController::class, 'logout']);

    Route::get('/home', [PortalLoyaltyController::class, 'home']);
    // Carte client (QR d'identification personnelle) — lecture seule, voir
    // PortalQrController pour le détail des choix.
    Route::get('/qr', [PortalQrController::class, 'show']);
    Route::get('/loyalty', [PortalLoyaltyController::class, 'programs']);
    Route::get('/rewards', [PortalLoyaltyController::class, 'rewards']);
    Route::get('/subscriptions', [PortalLoyaltyController::class, 'subscriptions']);
    Route::get('/prestations', [PortalPrestationsController::class, 'index']);

    // Reuses the exact same controller as the staff notification bell —
    // Request::user() resolves against whichever guard authenticated the
    // request, so this needs no client-specific duplicate.
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::middleware('permission:reports.view_all')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index']);
        Route::get('/reports/monthly', [ReportController::class, 'monthly']);
        // Miroir jeton du PDF servi par routes/web.php sous le guard de session.
        // Meme controleur, meme service, meme permission (reports.view_all) :
        // seule l'authentification change, pour qu'un client Bearer puisse le
        // recuperer. Aucun montant n'est recalcule ici.
        Route::get('/reports/monthly/pdf', [ReportController::class, 'monthlyPdf']);
        Route::get('/reports/advances', [ReportController::class, 'advances']);
        Route::get('/reports/commissions', [ReportController::class, 'commissions']);
        Route::get('/reports/prestations', [ReportController::class, 'prestations']);
    });
    Route::middleware('permission:activity_log.view')->group(function () {
        Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    });
    Route::get('/settings', [SettingsController::class, 'show']);
    Route::middleware('permission:settings.manage')->group(function () {
        Route::match(['post', 'put'], '/settings', [SettingsController::class, 'update']);
        Route::delete('/settings/logo', [SettingsController::class, 'removeLogo']);
    });
    Route::put('/profile', [SettingsController::class, 'updateProfile']);
    Route::post('/profile/password', [SettingsController::class, 'updatePassword']);

    // `agenda.partner` grants a restricted view: AppointmentController scopes
    // every operation to the caller's own partner record (see restrictedPartner()).
    Route::middleware('permission:agenda.manage|agenda.partner')->group(function () {
        Route::apiResource('/appointments', AppointmentController::class);

        // §26-32 — the admin review workflow for partner-submitted bookings.
        // confirm/refuse/propose-alternate are staff-only (checked in-method,
        // like restrictedPartner() already does for the rest of this
        // controller); proposal/accept|decline are reachable by the owning
        // partner via the same assertCanAccess() ownership check.
        Route::post('/appointments/{appointment}/confirm', [AppointmentController::class, 'confirm']);
        Route::post('/appointments/{appointment}/refuse', [AppointmentController::class, 'refuse']);
        Route::post('/appointments/{appointment}/propose-alternate', [AppointmentController::class, 'proposeAlternate']);
        Route::post('/appointments/{appointment}/proposal/accept', [AppointmentController::class, 'proposalAccept']);
        Route::post('/appointments/{appointment}/proposal/decline', [AppointmentController::class, 'proposalDecline']);
    });

    Route::middleware('permission:partners.manage')->group(function () {
        Route::apiResource('/partners', PartnerController::class);
        Route::post('/partners/{partner}/reset-password', [PartnerController::class, 'resetPassword']);
        Route::patch('/partners/{partner}/status', [PartnerController::class, 'status']);

        // §21 — admin selects a partner's validated commissions and marks
        // them paid (mode/référence/notes recorded on the payout header).
        Route::get('/partner-commissions', [PartnerCommissionPayoutController::class, 'index']);
        Route::post('/partner-commission-payouts', [PartnerCommissionPayoutController::class, 'store']);

        // §25 — admin inbox: every partner's support conversations.
        Route::get('/support/conversations', [SupportInboxController::class, 'index']);
        Route::get('/support/conversations/{conversation}', [SupportInboxController::class, 'show']);
        Route::post('/support/conversations/{conversation}/messages', [SupportInboxController::class, 'storeMessage']);
        Route::patch('/support/conversations/{conversation}/status', [SupportInboxController::class, 'updateStatus']);
    });

    // Partner portal self-service surface — no `permission:` gate: any
    // authenticated account is allowed to *hit* these routes, but every
    // controller immediately scopes to `$user->partner` (RequiresActivePartner
    // trait) and aborts 403 for anyone without one, exactly like
    // AppointmentController::restrictedPartner() already does for /appointments.
    Route::prefix('partner')->group(function () {
        Route::get('/dashboard', [PartnerDashboardController::class, 'index']);
        Route::get('/services', [PartnerPortalServiceController::class, 'index']);
        Route::get('/clients', [PartnerClientController::class, 'index']);
        Route::get('/clients/{client}', [PartnerClientController::class, 'show']);
        Route::patch('/clients/{client}/archive', [PartnerClientController::class, 'archive']);
        Route::patch('/clients/{client}/unarchive', [PartnerClientController::class, 'unarchive']);
        Route::get('/commissions', [PartnerPortalCommissionController::class, 'index']);
        Route::get('/profile', [PartnerProfileController::class, 'show']);
        Route::patch('/profile', [PartnerProfileController::class, 'update']);
        Route::patch('/profile/password', [PartnerProfileController::class, 'updatePassword']);
        Route::post('/profile/logo', [PartnerProfileController::class, 'updateLogo']);
        Route::delete('/profile/logo', [PartnerProfileController::class, 'destroyLogo']);

        // §24 — the partner's own support chat, scoped to their own conversations.
        Route::get('/support/conversations', [PartnerSupportController::class, 'index']);
        Route::post('/support/conversations', [PartnerSupportController::class, 'store']);
        Route::get('/support/conversations/{conversation}', [PartnerSupportController::class, 'show']);
        Route::post('/support/conversations/{conversation}/messages', [PartnerSupportController::class, 'storeMessage']);
    });

    Route::middleware('permission:caisse.manage')->group(function () {
        Route::get('/work-days/active', [WorkDayController::class, 'activeDay']);
        Route::get('/work-days/{workDay}/pdf', [WorkDayController::class, 'pdf']);
        Route::get('/work-days/{workDay}', [WorkDayController::class, 'show']);
        Route::get('/work-days', [WorkDayController::class, 'index']);
        Route::post('/work-days/{workDay}/close', [WorkDayController::class, 'close']);
        Route::post('/work-days', [WorkDayController::class, 'store']);
        Route::get('/cash-movements', [CashMovementController::class, 'index']);
        Route::post('/cash-movements', [CashMovementController::class, 'store']);

        Route::get('/transactions', [TransactionController::class, 'index']);
        Route::post('/transactions', [TransactionController::class, 'store']);
        Route::post('/transactions/{sale}/print', [TransactionController::class, 'recordPrint']);
        Route::delete('/transactions/{sale}', [TransactionController::class, 'destroy']);

        Route::get('/expenses', [ExpenseController::class, 'index']);
        // `period.open` : une depense d'un mois cloture ne se cree plus, ne se
        // modifie plus, et ne peut pas non plus etre DEPLACEE vers ce mois —
        // le middleware lit la periode avant et apres la modification.
        Route::middleware('period.open')->group(function () {
            Route::post('/expenses', [ExpenseController::class, 'store']);
            Route::put('/expenses/{expense}', [ExpenseController::class, 'update']);
            Route::post('/expenses/{expense}/convert-to-advance', [ExpenseController::class, 'convertToAdvance']);
            // Super-admin only (checked in-controller — no dedicated spatie
            // permission, same pattern as AdvanceController's patron gate).
            Route::delete('/expenses/{expense}', [ExpenseController::class, 'destroy']);
        });

        Route::apiResource('/products', ProductController::class);
    });

    Route::middleware('permission:employees.manage')->group(function () {
        Route::get('/advances', [AdvanceController::class, 'index']);
        // Meme verrou que les depenses : `given_on` decide du mois, et une
        // avance antidatee dans un mois cloture est refusee cote serveur.
        Route::middleware('period.open')->group(function () {
            Route::post('/advances/settle-before', [AdvanceController::class, 'settleBefore']);
            Route::post('/advances/{advance}/settle', [AdvanceController::class, 'settle']);
            Route::post('/advances', [AdvanceController::class, 'store']);
            Route::put('/advances/{advance}', [AdvanceController::class, 'update']);
            Route::delete('/advances/{advance}', [AdvanceController::class, 'destroy']);
        });

        Route::apiResource('/employees', EmployeeController::class);
        Route::post('/employees/{employee}/reset-password', [EmployeeController::class, 'resetPassword']);
        Route::post('/employees/{employee}/quick-create-account', [EmployeeController::class, 'quickCreateAccount']);
        Route::patch('/employees/{employee}/status', [EmployeeController::class, 'status']);
    });

    Route::middleware('permission:commissions.manage')->group(function () {
        Route::get('/employee-service-commissions', [EmployeeServiceCommissionController::class, 'index']);
        Route::post('/employee-service-commissions', [EmployeeServiceCommissionController::class, 'store']);
        Route::post('/employee-service-commissions/recalculate-all', [EmployeeServiceCommissionController::class, 'recalculateAll']);
        // TEMPORARY — see CommissionRegularizationController's doc comment.
        Route::post('/employees/{employee}/regularize-commissions', CommissionRegularizationController::class);
        Route::post('/employee-service-commissions/{employeeServiceCommission}/recalculate', [EmployeeServiceCommissionController::class, 'recalculate']);
        Route::patch('/employee-service-commissions/{employeeServiceCommission}', [EmployeeServiceCommissionController::class, 'update']);
        Route::delete('/employee-service-commissions/{employeeServiceCommission}', [EmployeeServiceCommissionController::class, 'destroy']);
        Route::get('/commission-payouts', [CommissionPayoutController::class, 'index']);
        // Un mois cloture n'accepte plus de versement : c'est tout l'objet de
        // la cloture, et la garde ne peut pas vivre uniquement dans l'UI.
        Route::middleware('period.open')->group(function () {
            Route::post('/commission-payouts', [CommissionPayoutController::class, 'store']);
        });
        Route::get('/employees/{employee}/commission-payouts', [CommissionPayoutController::class, 'history']);
    });

    // Cloture mensuelle.
    //
    // L'etat des periodes n'est pas une information privilegiee — les deux
    // clients en ont besoin pour dessiner leur selecteur — donc pas de
    // `permission:` ici, seulement l'authentification.
    Route::get('/periods', [MonthlyClosureController::class, 'periods']);

    Route::middleware('permission:months.close')->group(function () {
        // Declare AVANT la route {period} nue, sinon celle-ci l'avalerait.
        Route::get('/monthly-closures/{period}/checklist', [MonthlyClosureController::class, 'checklist']);
        Route::post('/monthly-closures', [MonthlyClosureController::class, 'store']);
    });

    // Historique : reserve au Super Admin. Un mois cloture quitte
    // definitivement les ecrans de l'admin, c'est le seul chemin qui y ramene.
    Route::middleware('permission:months.history.view')->group(function () {
        Route::get('/monthly-closures', [MonthlyClosureController::class, 'index']);
        Route::get('/monthly-closures/{period}', [MonthlyClosureController::class, 'show']);
    });

    // Loyalty & Subscriptions
    Route::middleware('permission:loyalty.manage')->group(function () {
        // Where every client stands on a program (7/10, 3/10…) — declared
        // before the apiResource so it isn't swallowed by its {id} routes.
        Route::get('/loyalty-programs/{loyalty_program}/progress', [LoyaltyProgramController::class, 'progress']);
        Route::apiResource('/loyalty-programs', LoyaltyProgramController::class);
        Route::apiResource('/subscription-plans', SubscriptionPlanController::class);
    });
    Route::middleware('permission:loyalty.redeem')->group(function () {
        Route::post('/clients/{client}/subscriptions', SubscriptionPurchaseController::class);
        Route::get('/clients/{client}/loyalty-status', ClientLoyaltyStatusController::class);
        Route::post('/qr/lookup', [ClientQrController::class, 'lookup']);
    });

    Route::middleware('permission:loyalty.view')->group(function () {
        Route::get('/loyalty/dashboard', [LoyaltyDashboardController::class, 'index']);
    });
    Route::middleware('permission:loyalty.reports.view')->group(function () {
        Route::get('/loyalty/reports/{report}', [LoyaltyReportController::class, 'show']);
    });
    Route::middleware('permission:loyalty.settings.manage')->group(function () {
        Route::get('/loyalty/settings', [LoyaltySettingsController::class, 'show']);
        Route::match(['post', 'put'], '/loyalty/settings', [LoyaltySettingsController::class, 'update']);
    });
    Route::middleware('permission:loyalty.qr.manage')->group(function () {
        Route::get('/loyalty/qr', [LoyaltyQrController::class, 'show']);
        Route::post('/loyalty/qr/regenerate', [LoyaltyQrController::class, 'regenerate']);
    });
    Route::middleware('permission:loyalty.redeem')->group(function () {
        Route::get('/clients/{client}/qr', [ClientQrController::class, 'show']);
        Route::post('/clients/{client}/qr/regenerate', [ClientQrController::class, 'regenerate']);
        Route::delete('/clients/{client}/qr', [ClientQrController::class, 'revoke']);
    });
    Route::middleware('permission:loyalty.rewards.adjust')->group(function () {
        Route::post('/clients/{client}/loyalty/programs/{program}/progress', [ClientLoyaltyAdjustmentController::class, 'adjustProgress']);
        Route::post('/clients/{client}/loyalty/programs/{program}/grant-reward', [ClientLoyaltyAdjustmentController::class, 'grantReward']);
        Route::post('/loyalty-rewards/{loyaltyReward}/cancel', [ClientLoyaltyAdjustmentController::class, 'cancelReward']);
    });
    Route::middleware('permission:subscriptions.suspend')->group(function () {
        Route::post('/client-subscriptions/{clientSubscription}/suspend', [ClientSubscriptionLifecycleController::class, 'suspend']);
        Route::post('/client-subscriptions/{clientSubscription}/resume', [ClientSubscriptionLifecycleController::class, 'resume']);
    });
    Route::middleware('permission:subscriptions.extend')->group(function () {
        Route::post('/client-subscriptions/{clientSubscription}/extend', [ClientSubscriptionLifecycleController::class, 'extend']);
    });
    Route::middleware('permission:subscriptions.sell')->group(function () {
        Route::post('/client-subscriptions/{clientSubscription}/renew', [ClientSubscriptionLifecycleController::class, 'renew']);
    });

    // Scanner: resolve a subscription QR token into its card, then validate a
    // visit explicitly — the scan itself never consumes anything.
    Route::middleware('permission:subscriptions.use|loyalty.redeem')->group(function () {
        Route::get('/subscriptions/scan/{token}', [SubscriptionScanController::class, 'show']);
        Route::post('/subscriptions/scan/{token}/validate', [SubscriptionScanController::class, 'validateVisit']);
    });

    Route::middleware('permission:subscriptions.view')->group(function () {
        Route::get('/client-subscriptions', [SubscriptionAdminController::class, 'index']);
        Route::get('/subscription-usages', [SubscriptionAdminController::class, 'usages']);
        Route::get('/subscriptions/dashboard', [SubscriptionAdminController::class, 'dashboard']);
    });

    Route::middleware('permission:subscriptions.manage')->group(function () {
        Route::post('/client-subscriptions/{clientSubscription}/cancel', [SubscriptionAdminController::class, 'cancel']);
        Route::post('/client-subscriptions/{clientSubscription}/refund', [SubscriptionAdminController::class, 'refund']);
        Route::post('/client-subscriptions/{clientSubscription}/regenerate-qr', [SubscriptionAdminController::class, 'regenerateQr']);
    });
    Route::middleware('permission:loyalty.view')->group(function () {
        Route::get('/marketing/segments', [MarketingSegmentController::class, 'index']);
        Route::get('/marketing/segments/{segment}', [MarketingSegmentController::class, 'show']);
    });

    Route::middleware('permission:users.manage')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::patch('/users/{user}', [UserController::class, 'update']);
        Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
    });

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::get('/me/dashboard', [MeController::class, 'dashboard']);
    Route::get('/me/advances', [MeController::class, 'advances']);
    Route::get('/me/commissions', [MeController::class, 'commissions']);
    Route::get('/me/report', [MeController::class, 'report']);
    Route::get('/me/report/export', [MeController::class, 'reportExport']);

    Route::prefix('me/workspace')->group(function () {
        Route::get('/dashboard', [EmployeeWorkspaceController::class, 'dashboard']);
        Route::get('/prestations', [EmployeeWorkspaceController::class, 'prestations']);
        Route::get('/agenda', [EmployeeWorkspaceController::class, 'agenda']);
        Route::get('/agenda/{appointment}', [EmployeeWorkspaceController::class, 'appointment']);
        Route::get('/commissions', [EmployeeWorkspaceController::class, 'commissions']);
        Route::get('/statistics', [EmployeeWorkspaceController::class, 'statistics']);
        Route::get('/clients', [EmployeeWorkspaceController::class, 'clients']);
        Route::get('/reviews', [EmployeeWorkspaceController::class, 'reviews']);
        Route::get('/documents', [EmployeeWorkspaceController::class, 'documents']);
        Route::get('/support/conversations', [EmployeeWorkspaceController::class, 'supportIndex']);
        Route::post('/support/conversations', [EmployeeWorkspaceController::class, 'supportStore']);
        Route::get('/support/conversations/{conversation}', [EmployeeWorkspaceController::class, 'supportShow']);
        Route::post('/support/conversations/{conversation}/messages', [EmployeeWorkspaceController::class, 'supportMessage']);
    });

    Route::get('/prestations/pending', [PrestationController::class, 'pending']);
    Route::get('/prestations', [PrestationController::class, 'index']);
    Route::post('/prestations', [PrestationController::class, 'store']);
    Route::get('/prestations/{prestation}', [PrestationController::class, 'show']);
    Route::post('/prestations/{prestation}/items', [PrestationController::class, 'storeItem']);
    Route::patch('/prestations/{prestation}/items/{item}', [PrestationController::class, 'updateItem']);
    Route::delete('/prestations/{prestation}/items/{item}', [PrestationController::class, 'destroyItem']);
    Route::post('/prestations/{prestation}/complete-services', [PrestationController::class, 'completeServices']);
    Route::post('/prestations/{prestation}/send-to-caisse', [PrestationController::class, 'sendToCaisse']);
    Route::post('/prestations/{prestation}/confirm-payment', [PrestationController::class, 'confirmPayment']);
    Route::post('/prestations/{prestation}/cancel', [PrestationController::class, 'cancel']);
    Route::post('/prestations/{prestation}/refund', [PrestationController::class, 'refund']);
    Route::post('/prestations/{prestation}/print', [PrestationController::class, 'print']);

    // index/show carry no permission middleware — visibility is enforced
    // inside ClientController/ClientPolicy (partner accounts scoped to their
    // own portfolio, see §3/§22), not by a route-level gate.
    Route::apiResource('/clients', ClientController::class)->only(['index', 'show']);
    // Partners must be able to register/edit the booking contact of a
    // reservation (name + phone) within their own portfolio, hence store and
    // update are also open to `agenda.partner` — ClientPolicy still blocks a
    // partner from touching another partner's or BOGOSLAND's clients.
    Route::middleware('permission:caisse.manage|agenda.partner')->group(function () {
        Route::apiResource('/clients', ClientController::class)->only(['store', 'update']);
    });
    Route::middleware('permission:caisse.manage')->group(function () {
        Route::apiResource('/clients', ClientController::class)->only(['destroy']);
        // Fiche client 360° + gestion de l'accès portail (téléphone + mot de passe).
        Route::get('/clients/{client}/overview', [ClientAccountController::class, 'overview']);
        Route::post('/clients/{client}/portal-password', [ClientAccountController::class, 'setPortalPassword']);
    });

    Route::apiResource('/services', ServiceController::class)->only(['index', 'show']);
    Route::middleware('permission:services.manage')->group(function () {
        Route::apiResource('/services', ServiceController::class)->only(['store', 'update', 'destroy']);
    });

    // ------------------------------------------------------------------
    // CAISSE — the validated POS surface (front-end: /pos). The legacy
    // register (/transactions, /prestations, /work-days) is untouched above
    // and still serves the day cycle these routes read; the pos-v2 prefix is
    // kept as-is so no client breaks. Money-moving actions re-check
    // caisse_v2.checkout / .discount / .cancel / .refund in the controllers.
    // ------------------------------------------------------------------
    Route::middleware('permission:caisse_v2.access')->prefix('pos-v2')->group(function () {
        Route::get('/dashboard', PosDashboardController::class);
        Route::get('/history', PosHistoryController::class);
        Route::post('/qr-lookup', PosQrController::class);
        Route::get('/clients/{client}/context', PosClientContextController::class);

        Route::get('/appointments/today', [PosAppointmentController::class, 'today']);
        Route::post('/appointments/{appointment}/open', [PosAppointmentController::class, 'open']);

        // File V1 des prestations envoyées par les employés — reprise en V2.
        Route::get('/pending', [PosPendingController::class, 'index']);
        Route::post('/pending/{prestation}/import', [PosPendingController::class, 'import']);

        Route::get('/subscriptions/{clientSubscription}/payments', [PosSubscriptionPaymentController::class, 'index']);
        Route::post('/subscriptions/{clientSubscription}/payments', [PosSubscriptionPaymentController::class, 'store']);

        Route::get('/invoices', [PosInvoiceController::class, 'index']);
        Route::post('/invoices', [PosInvoiceController::class, 'store']);
        Route::get('/invoices/{prestation}', [PosInvoiceController::class, 'show']);
        Route::patch('/invoices/{prestation}', [PosInvoiceController::class, 'update']);
        Route::post('/invoices/{prestation}/hold', [PosInvoiceController::class, 'hold']);
        Route::post('/invoices/{prestation}/resume', [PosInvoiceController::class, 'resume']);
        Route::post('/invoices/{prestation}/lines', [PosInvoiceController::class, 'storeLine']);
        Route::patch('/invoices/{prestation}/lines/{item}', [PosInvoiceController::class, 'updateLine']);
        Route::delete('/invoices/{prestation}/lines/{item}', [PosInvoiceController::class, 'destroyLine']);
        Route::post('/invoices/{prestation}/cancel', [PosInvoiceController::class, 'cancel']);
        Route::post('/invoices/{prestation}/checkout', [PosCheckoutController::class, 'checkout']);
        Route::post('/invoices/{prestation}/refund', [PosCheckoutController::class, 'refund']);
        Route::post('/invoices/{prestation}/print', [PosCheckoutController::class, 'print']);
    });
});
