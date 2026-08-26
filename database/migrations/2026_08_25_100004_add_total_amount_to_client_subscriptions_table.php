<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Partial subscription payment (Caisse V2 §16) — the price actually agreed
 * for THIS subscription, frozen at sale time. Nullable: legacy rows keep
 * NULL and readers fall back to plan_snapshot price / plan price, which is
 * exactly what SubscriptionAdminController already displays today.
 *
 * The amount PAID is never stored as a scalar — it is derived from the
 * purchase Sale plus the subscription_payments ledger (next migration), so
 * a voided sale automatically stops counting, same rule the whole app uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('client_subscriptions', function (Blueprint $table) {
            $table->decimal('total_amount', 10, 2)->nullable()->after('plan_snapshot');
        });
    }

    public function down(): void
    {
        Schema::table('client_subscriptions', function (Blueprint $table) {
            $table->dropColumn('total_amount');
        });
    }
};
