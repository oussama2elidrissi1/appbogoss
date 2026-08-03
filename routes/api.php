<?php

use App\Http\Controllers\Api\AdvanceController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\TransactionController;
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

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/reports/monthly', [ReportController::class, 'monthly']);
    Route::get('/reports/advances', [ReportController::class, 'advances']);
    Route::get('/settings', [SettingsController::class, 'show']);
    Route::match(['post', 'put'], '/settings', [SettingsController::class, 'update']);
    Route::delete('/settings/logo', [SettingsController::class, 'removeLogo']);
    Route::put('/profile', [SettingsController::class, 'updateProfile']);
    Route::post('/profile/password', [SettingsController::class, 'updatePassword']);

    Route::apiResource('/appointments', AppointmentController::class);

    Route::get('/work-days/active', [WorkDayController::class, 'activeDay']);
    Route::get('/work-days/{workDay}/pdf', [WorkDayController::class, 'pdf']);
    Route::post('/work-days/{workDay}/close', [WorkDayController::class, 'close']);
    Route::get('/work-days/{workDay}', [WorkDayController::class, 'show']);
    Route::get('/work-days', [WorkDayController::class, 'index']);
    Route::post('/work-days', [WorkDayController::class, 'store']);

    Route::get('/transactions', [TransactionController::class, 'index']);
    Route::post('/transactions', [TransactionController::class, 'store']);
    Route::post('/transactions/{sale}/print', [TransactionController::class, 'recordPrint']);
    Route::delete('/transactions/{sale}', [TransactionController::class, 'destroy']);

    Route::post('/advances/{advance}/settle', [AdvanceController::class, 'settle']);
    Route::get('/advances', [AdvanceController::class, 'index']);
    Route::post('/advances', [AdvanceController::class, 'store']);
    Route::put('/advances/{advance}', [AdvanceController::class, 'update']);
    Route::delete('/advances/{advance}', [AdvanceController::class, 'destroy']);

    Route::get('/expenses', [ExpenseController::class, 'index']);
    Route::post('/expenses', [ExpenseController::class, 'store']);

    Route::apiResource('/employees', EmployeeController::class);
    Route::apiResource('/clients', ClientController::class);
    Route::apiResource('/products', ProductController::class);
    Route::apiResource('/services', ServiceController::class);
});
