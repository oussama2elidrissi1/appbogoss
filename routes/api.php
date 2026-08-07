<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AdvanceController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashMovementController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ClientLoyaltyStatusController;
use App\Http\Controllers\Api\ClientQrController;
use App\Http\Controllers\Api\CommissionPayoutController;
use App\Http\Controllers\Api\CommissionRegularizationController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeServiceCommissionController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\LoyaltyDashboardController;
use App\Http\Controllers\Api\LoyaltyProgramController;
use App\Http\Controllers\Api\LoyaltyQrController;
use App\Http\Controllers\Api\LoyaltyReportController;
use App\Http\Controllers\Api\LoyaltySettingsController;
use App\Http\Controllers\Api\MarketingSegmentController;
use App\Http\Controllers\Api\Portal\PortalController;
use App\Http\Controllers\Api\Portal\PortalLoyaltyController;
use App\Http\Controllers\Api\Portal\PortalPrestationsController;
use App\Http\Controllers\Api\Public\JoinController;
use App\Http\Controllers\Api\Public\OtpController;
use App\Http\Controllers\Api\SubscriptionPlanController;
use App\Http\Controllers\Api\SubscriptionPurchaseController;
use App\Http\Controllers\Api\ClientLoyaltyAdjustmentController;
use App\Http\Controllers\Api\ClientSubscriptionLifecycleController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PrestationController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SettingsController;
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
// and phone+OTP auth. No spatie permission applies here (there is no staff
// user), gated instead by the loyalty_qr_registration_enabled setting/token
// and a coarse IP-based throttle (see RouteServiceProvider's 'otp' limiter).
Route::middleware('throttle:otp')->prefix('public')->group(function () {
    Route::get('/join/status', [JoinController::class, 'status']);
    Route::post('/join', [JoinController::class, 'register']);
    Route::post('/otp/request', [OtpController::class, 'request']);
    Route::post('/otp/verify', [OtpController::class, 'verify']);
});

// Customer portal ("Mon BOGOSLAND") — separate `client` guard, no spatie
// permissions (a Client isn't staff, see AuthServiceProvider's
// Gate::before which only special-cases super-admin Users).
Route::middleware('auth:client')->prefix('client')->group(function () {
    Route::get('/me', [PortalController::class, 'me']);
    Route::put('/me', [PortalController::class, 'updateProfile']);
    Route::post('/logout', [PortalController::class, 'logout']);

    Route::get('/home', [PortalLoyaltyController::class, 'home']);
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

    Route::middleware('permission:agenda.manage')->group(function () {
        Route::apiResource('/appointments', AppointmentController::class);
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
        Route::post('/expenses', [ExpenseController::class, 'store']);
        Route::put('/expenses/{expense}', [ExpenseController::class, 'update']);
        Route::post('/expenses/{expense}/convert-to-advance', [ExpenseController::class, 'convertToAdvance']);

        Route::apiResource('/products', ProductController::class);
    });

    Route::middleware('permission:employees.manage')->group(function () {
        Route::post('/advances/settle-before', [AdvanceController::class, 'settleBefore']);
        Route::post('/advances/{advance}/settle', [AdvanceController::class, 'settle']);
        Route::get('/advances', [AdvanceController::class, 'index']);
        Route::post('/advances', [AdvanceController::class, 'store']);
        Route::put('/advances/{advance}', [AdvanceController::class, 'update']);
        Route::delete('/advances/{advance}', [AdvanceController::class, 'destroy']);

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
        Route::post('/commission-payouts', [CommissionPayoutController::class, 'store']);
        Route::get('/employees/{employee}/commission-payouts', [CommissionPayoutController::class, 'history']);
    });

    // Loyalty & Subscriptions
    Route::middleware('permission:loyalty.manage')->group(function () {
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

    Route::apiResource('/clients', ClientController::class)->only(['index', 'show']);
    Route::middleware('permission:caisse.manage')->group(function () {
        Route::apiResource('/clients', ClientController::class)->only(['store', 'update', 'destroy']);
    });

    Route::apiResource('/services', ServiceController::class)->only(['index', 'show']);
    Route::middleware('permission:services.manage')->group(function () {
        Route::apiResource('/services', ServiceController::class)->only(['store', 'update', 'destroy']);
    });
});
