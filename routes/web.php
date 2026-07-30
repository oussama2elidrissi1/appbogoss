<?php

use App\Http\Controllers\Api\WorkDayController;
use App\Http\Controllers\Api\ReportController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/login', fn () => view('app'))->name('login');
Route::middleware('auth')->get('/work-days/{workDay}/pdf', [WorkDayController::class, 'pdf'])
    ->name('work-days.pdf');
Route::middleware('auth')->get('/reports/monthly/pdf', [ReportController::class, 'monthlyPdf'])
    ->name('reports.monthly.pdf');
Route::get('/{any}', fn () => view('app'))->where('any', '^(?!api).*$');
