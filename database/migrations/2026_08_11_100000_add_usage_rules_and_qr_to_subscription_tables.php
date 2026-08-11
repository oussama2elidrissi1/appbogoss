<?php

use App\Models\ClientSubscription;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            // Usage rules — all optional; null means "no restriction".
            // allowed_days: JSON array of ISO weekday numbers (1=lundi … 7=dimanche).
            $table->json('allowed_days')->nullable()->after('notes');
            // 'HH:MM' wall-clock bounds in the salon timezone (loyalty_timezone).
            $table->string('time_start', 5)->nullable()->after('allowed_days');
            $table->string('time_end', 5)->nullable()->after('time_start');
            // Plan-level visit caps counted across every included service.
            $table->unsignedSmallInteger('max_per_day')->nullable()->after('time_end');
            $table->unsignedSmallInteger('max_per_week')->nullable()->after('max_per_day');
            $table->unsignedSmallInteger('max_per_month')->nullable()->after('max_per_week');
            $table->unsignedInteger('min_interval_minutes')->nullable()->after('max_per_month');
        });

        Schema::table('client_subscriptions', function (Blueprint $table) {
            // Personal scan token — random, never derived from ids. The QR the
            // client shows encodes only this value.
            $table->string('qr_token', 64)->nullable()->unique()->after('sale_id');
        });

        Schema::table('client_subscription_usages', function (Blueprint $table) {
            // used_on (date) keeps driving period keys; used_at records the
            // exact instant for min-interval checks and history display.
            $table->dateTime('used_at')->nullable()->after('used_on');
            $table->foreignId('employee_id')->nullable()->after('used_at')->constrained('employees')->nullOnDelete();
            $table->foreignId('validated_by_user_id')->nullable()->after('employee_id')->constrained('users')->nullOnDelete();
            // 'caisse' (prestation cart) or 'scanner' (QR validation page).
            $table->string('channel', 20)->nullable()->after('validated_by_user_id');
        });

        // Every existing subscription gets a token so already-sold plans are
        // scannable without manual regeneration.
        ClientSubscription::query()->whereNull('qr_token')->each(function (ClientSubscription $subscription) {
            $subscription->update(['qr_token' => Str::random(48)]);
        });
    }

    public function down(): void
    {
        Schema::table('client_subscription_usages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('validated_by_user_id');
            $table->dropConstrainedForeignId('employee_id');
            $table->dropColumn(['used_at', 'channel']);
        });

        Schema::table('client_subscriptions', function (Blueprint $table) {
            $table->dropColumn('qr_token');
        });

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn([
                'allowed_days',
                'time_start',
                'time_end',
                'max_per_day',
                'max_per_week',
                'max_per_month',
                'min_interval_minutes',
            ]);
        });
    }
};
