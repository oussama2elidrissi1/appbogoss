<?php

namespace App\Services;

use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\CustomerLoyaltyAccount;
use App\Models\LoyaltyLedgerEntry;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Evaluates every active loyalty program against a just-finalized Sale (and,
 * when it came from the Prestation workflow, its line items) and records the
 * result. Idempotent per (sale, program, direction): a duplicate call — retry,
 * double click, whatever — never double-counts, because every write goes
 * through insertOrIgnore against a unique ledger key before anything else
 * happens (see applyDelta/reverseLedgerEntry). Called from the two places a
 * Sale becomes final (PrestationService::confirmPayment,
 * TransactionController::store) and reversed from the two places a Sale is
 * undone (PrestationService::refund, TransactionController::destroy).
 */
class LoyaltyEngine
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function processSale(Sale $sale, ?Prestation $prestation = null): void
    {
        if ($sale->client_id === null) {
            return;
        }

        $lines = $this->saleLines($sale, $prestation);
        if (empty($lines)) {
            return;
        }

        $client = Client::find($sale->client_id);
        if ($client === null) {
            return;
        }

        $programs = LoyaltyProgram::query()
            ->where('is_active', true)
            ->whereIn('type', [
                LoyaltyProgram::TYPE_SERVICE_COUNT,
                LoyaltyProgram::TYPE_POINTS,
                LoyaltyProgram::TYPE_AMOUNT_SPENT,
                LoyaltyProgram::TYPE_VISIT_COUNT,
            ])
            ->where(fn ($q) => $q->whereNull('starts_on')->orWhereDate('starts_on', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', now()))
            ->get();

        foreach ($programs as $program) {
            $this->accrueForProgram($program, $client, $sale, $lines);
        }
    }

    public function reverseSale(Sale $sale): void
    {
        $entries = LoyaltyLedgerEntry::where('sourceable_type', Sale::class)
            ->where('sourceable_id', $sale->id)
            ->where('direction', LoyaltyLedgerEntry::DIRECTION_ACCRUAL)
            ->get();

        foreach ($entries as $entry) {
            $this->reverseLedgerEntry($entry);
        }
    }

    /**
     * @return array<int, array{service_id: int|null, category: string|null, amount: float, quantity: int, is_free: bool}>
     */
    private function saleLines(Sale $sale, ?Prestation $prestation): array
    {
        if ($prestation !== null) {
            $prestation->loadMissing('items.service');

            return $prestation->items->map(fn (PrestationItem $item) => [
                'service_id' => $item->service_id,
                'category' => $item->service?->category,
                'amount' => (float) $item->lineTotal(),
                'quantity' => (int) $item->quantity,
                'is_free' => (bool) $item->is_free,
            ])->all();
        }

        return [[
            'service_id' => $sale->service_id,
            'category' => $sale->category,
            'amount' => (float) $sale->total,
            'quantity' => 1,
            'is_free' => false,
        ]];
    }

    private function accrueForProgram(LoyaltyProgram $program, Client $client, Sale $sale, array $lines): void
    {
        $config = $program->config ?? [];
        $countFreeLines = (bool) ($config['count_free_lines'] ?? false);

        $matching = array_values(array_filter($lines, function (array $line) use ($config, $countFreeLines) {
            if (! $countFreeLines && $line['is_free']) {
                return false;
            }
            if (! empty($config['service_id']) && (int) $line['service_id'] !== (int) $config['service_id']) {
                return false;
            }
            if (! empty($config['category']) && $line['category'] !== $config['category']) {
                return false;
            }

            return true;
        }));

        $metric = null;
        $delta = 0.0;

        switch ($program->type) {
            case LoyaltyProgram::TYPE_SERVICE_COUNT:
                if (empty($matching)) {
                    return;
                }
                $metric = 'count';
                $delta = (float) array_sum(array_column($matching, 'quantity'));
                break;

            case LoyaltyProgram::TYPE_VISIT_COUNT:
                if (empty($lines)) {
                    return;
                }
                $metric = 'count';
                $delta = 1.0;
                break;

            case LoyaltyProgram::TYPE_POINTS:
                if (empty($matching)) {
                    return;
                }
                $pointsPerMad = (float) ($config['points_per_mad'] ?? 1);
                $amount = (float) array_sum(array_column($matching, 'amount'));
                $delta = floor($amount * $pointsPerMad);
                if ($delta <= 0) {
                    return;
                }
                $metric = 'points';
                break;

            case LoyaltyProgram::TYPE_AMOUNT_SPENT:
                if (empty($matching)) {
                    return;
                }
                $metric = 'amount';
                $delta = (float) array_sum(array_column($matching, 'amount'));
                break;

            default:
                return;
        }

        $this->applyDelta($program, $client, $sale, $metric, $delta);
    }

    private function applyDelta(LoyaltyProgram $program, Client $client, Sale $sale, string $metric, float $delta): void
    {
        if ($delta == 0.0) {
            return;
        }

        DB::transaction(function () use ($program, $client, $sale, $metric, $delta) {
            $inserted = DB::table('loyalty_ledger_entries')->insertOrIgnore([
                'client_id' => $client->id,
                'loyalty_program_id' => $program->id,
                'direction' => LoyaltyLedgerEntry::DIRECTION_ACCRUAL,
                'metric' => $metric,
                'delta' => $delta,
                'sourceable_type' => Sale::class,
                'sourceable_id' => $sale->id,
                'reason' => null,
                'created_by_user_id' => Auth::id(),
                'created_at' => now(),
            ]);

            if ($inserted === 0) {
                // Already processed this exact sale for this program — idempotent no-op.
                return;
            }

            $ledgerEntry = LoyaltyLedgerEntry::where('sourceable_type', Sale::class)
                ->where('sourceable_id', $sale->id)
                ->where('loyalty_program_id', $program->id)
                ->where('direction', LoyaltyLedgerEntry::DIRECTION_ACCRUAL)
                ->firstOrFail();

            $progress = $this->lockedProgress($client, $program);

            $config = $program->config ?? [];
            $rollover = (bool) ($config['rollover_surplus'] ?? true);
            $threshold = (float) ($config['threshold'] ?? 0);

            $field = match ($metric) {
                'count' => 'counter',
                'points' => 'points_balance',
                'amount' => 'amount_accumulated',
                default => 'counter',
            };

            $new = (float) $progress->{$field} + $delta;
            $rewardsToGenerate = 0;

            if ($threshold > 0) {
                if ($rollover) {
                    while ($new >= $threshold) {
                        $new -= $threshold;
                        $rewardsToGenerate++;
                    }
                } elseif ($new >= $threshold) {
                    $rewardsToGenerate = 1;
                    $new = 0;
                }
            }

            $progress->update([
                $field => in_array($field, ['counter', 'points_balance'], true) ? (int) round($new) : $new,
                'last_activity_at' => now(),
            ]);

            if ($field === 'points_balance') {
                $this->syncAccountPointsBalance($client);
            } else {
                $this->ensureLoyaltyAccount($client);
            }

            for ($i = 0; $i < $rewardsToGenerate; $i++) {
                $this->generateReward($program, $client, $ledgerEntry);
            }
        });
    }

    private function reverseLedgerEntry(LoyaltyLedgerEntry $entry): void
    {
        DB::transaction(function () use ($entry) {
            $inserted = DB::table('loyalty_ledger_entries')->insertOrIgnore([
                'client_id' => $entry->client_id,
                'loyalty_program_id' => $entry->loyalty_program_id,
                'direction' => LoyaltyLedgerEntry::DIRECTION_REVERSAL,
                'metric' => $entry->metric,
                'delta' => -$entry->delta,
                'sourceable_type' => $entry->sourceable_type,
                'sourceable_id' => $entry->sourceable_id,
                'reason' => 'Vente annulée/remboursée.',
                'created_by_user_id' => Auth::id(),
                'created_at' => now(),
            ]);

            if ($inserted === 0) {
                return;
            }

            $progress = LoyaltyProgramProgress::query()
                ->where('client_id', $entry->client_id)
                ->where('loyalty_program_id', $entry->loyalty_program_id)
                ->lockForUpdate()
                ->first();

            if ($progress !== null) {
                $field = match ($entry->metric) {
                    'count' => 'counter',
                    'points' => 'points_balance',
                    'amount' => 'amount_accumulated',
                    default => 'counter',
                };
                $new = max(0.0, (float) $progress->{$field} - (float) $entry->delta);
                $progress->update([
                    $field => in_array($field, ['counter', 'points_balance'], true) ? (int) round($new) : $new,
                ]);

                if ($field === 'points_balance') {
                    $this->syncAccountPointsBalance(Client::findOrFail($entry->client_id));
                }
            }

            LoyaltyReward::where('triggering_ledger_entry_id', $entry->id)
                ->whereIn('status', [LoyaltyReward::STATUS_AVAILABLE, LoyaltyReward::STATUS_RESERVED])
                ->get()
                ->each(function (LoyaltyReward $reward) {
                    $reward->update([
                        'status' => LoyaltyReward::STATUS_CANCELLED,
                        'cancelled_at' => now(),
                        'cancel_reason' => 'Vente à l’origine de cette récompense annulée/remboursée.',
                    ]);
                    $this->activityLogger->log('loyalty.reward_cancelled', $reward);
                });

            $this->activityLogger->log('loyalty.accrual_reversed', null, [], [
                'client_id' => $entry->client_id,
                'loyalty_program_id' => $entry->loyalty_program_id,
                'delta' => -$entry->delta,
            ]);
        });
    }

    private function generateReward(LoyaltyProgram $program, Client $client, LoyaltyLedgerEntry $ledgerEntry): LoyaltyReward
    {
        return $this->createReward($program, $client, $ledgerEntry->id);
    }

    /**
     * Used by the birthday/custom sweeps (no triggering sale — date- or
     * profile-driven instead), and internally by generateReward().
     */
    public function generateStandaloneReward(LoyaltyProgram $program, Client $client): LoyaltyReward
    {
        return $this->createReward($program, $client, null);
    }

    private function createReward(LoyaltyProgram $program, Client $client, ?int $triggeringLedgerEntryId): LoyaltyReward
    {
        $config = $program->config ?? [];
        $reward = $config['reward'] ?? [];
        $expiresAfterDays = $config['reward_expires_after_days'] ?? null;

        $loyaltyReward = LoyaltyReward::create([
            'client_id' => $client->id,
            'loyalty_program_id' => $program->id,
            'triggering_ledger_entry_id' => $triggeringLedgerEntryId,
            'program_snapshot' => $program->toArray(),
            'type' => $reward['type'] ?? 'service',
            'status' => LoyaltyReward::STATUS_AVAILABLE,
            'service_id' => $reward['service_id'] ?? null,
            'value' => $reward['value'] ?? null,
            'commission_basis' => $program->commission_basis,
            'commission_value' => $program->commission_value,
            'generated_at' => now(),
            'expires_at' => $expiresAfterDays ? now()->addDays((int) $expiresAfterDays) : null,
        ]);

        $this->ensureLoyaltyAccount($client);

        $this->activityLogger->log('loyalty.reward_generated', $loyaltyReward, [], [
            'program' => $program->name,
            'client_id' => $client->id,
        ]);

        return $loyaltyReward;
    }

    public function ensureLoyaltyAccount(Client $client): CustomerLoyaltyAccount
    {
        return CustomerLoyaltyAccount::firstOrCreate(
            ['client_id' => $client->id],
            ['status' => CustomerLoyaltyAccount::STATUS_ACTIVE],
        );
    }

    /**
     * customer_loyalty_accounts.points_balance is a denormalized mirror of
     * every points-type program's progress for this client — recomputed from
     * source (not incremented) so it can never drift from
     * loyalty_program_progress, which stays the source of truth.
     */
    private function syncAccountPointsBalance(Client $client): void
    {
        $account = $this->ensureLoyaltyAccount($client);

        $total = (int) LoyaltyProgramProgress::where('client_id', $client->id)
            ->whereIn('loyalty_program_id', LoyaltyProgram::where('type', LoyaltyProgram::TYPE_POINTS)->pluck('id'))
            ->sum('points_balance');

        $account->update(['points_balance' => $total]);
    }

    private function lockedProgress(Client $client, LoyaltyProgram $program): LoyaltyProgramProgress
    {
        LoyaltyProgramProgress::firstOrCreate([
            'client_id' => $client->id,
            'loyalty_program_id' => $program->id,
        ]);

        return LoyaltyProgramProgress::query()
            ->where('client_id', $client->id)
            ->where('loyalty_program_id', $program->id)
            ->lockForUpdate()
            ->firstOrFail();
    }

    /**
     * Date-driven, not sale-driven — meant to run as a periodic sweep (see the
     * loyalty:sweep console command), not on every checkout.
     */
    public function generateBirthdayRewards(): int
    {
        $programs = LoyaltyProgram::where('type', LoyaltyProgram::TYPE_BIRTHDAY)->where('is_active', true)->get();
        if ($programs->isEmpty()) {
            return 0;
        }

        $generated = 0;
        $weekStart = now()->startOfWeek();
        $weekEnd = now()->endOfWeek();

        foreach ($programs as $program) {
            Client::whereNotNull('birth_date')->orderBy('id')->chunk(200, function ($clients) use ($program, $weekStart, $weekEnd, &$generated) {
                foreach ($clients as $client) {
                    $birthdayThisYear = $client->birth_date->copy()->year($weekStart->year);
                    if ($birthdayThisYear->lt($weekStart) || $birthdayThisYear->gt($weekEnd)) {
                        continue;
                    }

                    $already = LoyaltyReward::where('client_id', $client->id)
                        ->where('loyalty_program_id', $program->id)
                        ->whereYear('generated_at', $weekStart->year)
                        ->exists();
                    if ($already) {
                        continue;
                    }

                    $this->generateStandaloneReward($program, $client);
                    $generated++;
                }
            });
        }

        return $generated;
    }

    /**
     * Type "custom" (spec §10.F) — AND-only combined conditions, evaluated on
     * a periodic sweep rather than per-sale (aggregate queries per client are
     * too costly to run inline in the checkout transaction). Grants at most
     * one reward per client per program — a genuinely repeatable custom
     * program is a known Phase 1 limitation.
     */
    public function evaluateCustomPrograms(): int
    {
        $programs = LoyaltyProgram::where('type', LoyaltyProgram::TYPE_CUSTOM)->where('is_active', true)->get();
        if ($programs->isEmpty()) {
            return 0;
        }

        $generated = 0;

        foreach ($programs as $program) {
            Client::orderBy('id')->chunk(200, function ($clients) use ($program, &$generated) {
                foreach ($clients as $client) {
                    if (! $this->clientMatchesConditions($program, $client)) {
                        continue;
                    }

                    $already = LoyaltyReward::where('client_id', $client->id)
                        ->where('loyalty_program_id', $program->id)
                        ->whereIn('status', [LoyaltyReward::STATUS_AVAILABLE, LoyaltyReward::STATUS_RESERVED, LoyaltyReward::STATUS_USED])
                        ->exists();
                    if ($already) {
                        continue;
                    }

                    $this->generateStandaloneReward($program, $client);
                    $generated++;
                }
            });
        }

        return $generated;
    }

    private function clientMatchesConditions(LoyaltyProgram $program, Client $client): bool
    {
        $conditions = $program->config['conditions'] ?? [];
        if (empty($conditions)) {
            return false;
        }

        foreach ($conditions as $condition) {
            if (! $this->conditionMatches($condition, $client)) {
                return false;
            }
        }

        return true;
    }

    private function conditionMatches(array $condition, Client $client): bool
    {
        return match ($condition['metric'] ?? null) {
            'total_spent_gte' => (float) Sale::where('client_id', $client->id)->sum('total') >= (float) ($condition['value'] ?? 0),
            'visits_gte' => (int) Sale::where('client_id', $client->id)->count() >= (int) ($condition['value'] ?? 0),
            'days_since_last_visit_gte' => $client->last_visit_at !== null
                && $client->last_visit_at->diffInDays(now()) >= (int) ($condition['value'] ?? 0),
            'has_active_subscription' => $client->subscriptions()->where('status', ClientSubscription::STATUS_ACTIVE)->exists() === (bool) ($condition['value'] ?? true),
            default => false,
        };
    }
}
