<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/**
 * §24 — query layer only (the Marketing module itself is still a
 * placeholder page with no campaign/send feature to plug this into yet).
 * Every segment is built on top of Client::where('consent_marketing_at')
 * — a client who declined marketing consent can never appear in any
 * segment here, full stop, regardless of how "relevant" they'd otherwise be.
 */
class MarketingSegmentController extends Controller
{
    private const SEGMENTS = [
        'new_registrants' => 'Nouveaux inscrits (7 derniers jours)',
        'close_to_reward' => 'Proches d’une récompense (80%+)',
        'reward_expiring_soon' => 'Récompense expirant bientôt',
        'subscription_expiring_soon' => 'Abonnement expirant bientôt',
        'subscription_expired' => 'Abonnement expiré',
        'inactive_30' => 'Aucun passage depuis 30 jours',
        'inactive_60' => 'Aucun passage depuis 60 jours',
        'vip' => 'Clients VIP (10+ visites)',
        'birthdays' => 'Anniversaires (7 prochains jours)',
    ];

    public function index(): JsonResponse
    {
        $data = collect(self::SEGMENTS)->map(fn ($label, $key) => [
            'key' => $key,
            'label' => $label,
            'count' => $this->clientsForSegment($key)->count(),
        ])->values();

        return response()->json(['data' => $data]);
    }

    public function show(string $segment): JsonResponse
    {
        if (! array_key_exists($segment, self::SEGMENTS)) {
            abort(404);
        }

        $clients = $this->clientsForSegment($segment)->map(fn (Client $client) => [
            'id' => $client->id,
            'name' => $client->name,
            'phone' => $client->phone,
        ])->values();

        return response()->json(['data' => $clients]);
    }

    private function marketable()
    {
        return Client::whereNotNull('consent_marketing_at');
    }

    private function clientsForSegment(string $segment): Collection
    {
        return match ($segment) {
            'new_registrants' => $this->marketable()->where('registered_at', '>=', now()->subDays(7))->get(),
            'close_to_reward' => $this->closeToReward(),
            'reward_expiring_soon' => $this->marketable()
                ->whereHas('loyaltyRewards', fn ($q) => $q->where('status', LoyaltyReward::STATUS_AVAILABLE)
                    ->whereNotNull('expires_at')
                    ->whereBetween('expires_at', [now(), now()->addDays(7)]))
                ->get(),
            'subscription_expiring_soon' => $this->marketable()
                ->whereHas('subscriptions', fn ($q) => $q->where('status', ClientSubscription::STATUS_ACTIVE)
                    ->whereBetween('ends_on', [now(), now()->addDays(7)]))
                ->get(),
            'subscription_expired' => $this->marketable()
                ->whereHas('subscriptions', fn ($q) => $q->where('status', ClientSubscription::STATUS_EXPIRED)
                    ->where('ends_on', '>=', now()->subDays(30)))
                ->get(),
            'inactive_30' => $this->marketable()->whereDate('last_visit_at', '<', now()->subDays(30))->get(),
            'inactive_60' => $this->marketable()->whereDate('last_visit_at', '<', now()->subDays(60))->get(),
            'vip' => $this->marketable()->withCount('sales')->having('sales_count', '>=', 10)->get(),
            'birthdays' => $this->birthdaysThisWeek(),
            default => collect(),
        };
    }

    private function closeToReward(): Collection
    {
        $programs = LoyaltyProgram::where('is_active', true)
            ->whereIn('type', [LoyaltyProgram::TYPE_SERVICE_COUNT, LoyaltyProgram::TYPE_POINTS, LoyaltyProgram::TYPE_AMOUNT_SPENT, LoyaltyProgram::TYPE_VISIT_COUNT])
            ->get();

        $clientIds = collect();
        foreach ($programs as $program) {
            $threshold = $program->config['threshold'] ?? null;
            if ($threshold === null || $threshold <= 0) {
                continue;
            }
            $field = match ($program->type) {
                LoyaltyProgram::TYPE_POINTS => 'points_balance',
                LoyaltyProgram::TYPE_AMOUNT_SPENT => 'amount_accumulated',
                default => 'counter',
            };
            $clientIds = $clientIds->merge(
                LoyaltyProgramProgress::where('loyalty_program_id', $program->id)
                    ->where($field, '>=', $threshold * 0.8)
                    ->where($field, '<', $threshold)
                    ->pluck('client_id'),
            );
        }

        return $this->marketable()->whereIn('id', $clientIds->unique())->get();
    }

    private function birthdaysThisWeek(): Collection
    {
        $start = now()->startOfWeek();
        $end = now()->endOfWeek();

        return $this->marketable()->whereNotNull('birth_date')->get()->filter(function (Client $client) use ($start, $end) {
            $birthday = $client->birth_date->copy()->year($start->year);

            return $birthday->between($start, $end);
        });
    }
}
