<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientSubscription;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyProgramProgress;
use App\Models\LoyaltyReward;
use App\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Fidélité → Rapports (§21). No maatwebsite/excel dependency — CSV export
 * via response()->streamDownload(), same "no new heavy dependency" call as
 * the rest of this build (dompdf already covers PDF elsewhere).
 */
class LoyaltyReportController extends Controller
{
    public function show(Request $request, string $report): JsonResponse|StreamedResponse
    {
        $rows = match ($report) {
            'programs' => $this->programsReport(),
            'rewards' => $this->rewardsReport($request),
            'subscriptions' => $this->subscriptionsReport($request),
            'loyal-clients' => $this->loyalClientsReport(),
            'inactive-clients' => $this->inactiveClientsReport($request),
            default => abort(404),
        };

        if ($request->query('format') === 'csv') {
            return $this->streamCsv($report, $rows);
        }

        return response()->json(['data' => $rows]);
    }

    private function programsReport(): array
    {
        return LoyaltyProgram::withCount('progress')
            ->withCount(['rewards as rewards_generated_count'])
            ->withCount(['rewards as rewards_used_count' => fn ($q) => $q->where('status', LoyaltyReward::STATUS_USED)])
            ->get()
            ->map(fn (LoyaltyProgram $program) => [
                'program' => $program->name,
                'type' => $program->type,
                'participants' => $program->progress_count,
                'rewards_generated' => $program->rewards_generated_count,
                'rewards_used' => $program->rewards_used_count,
                'estimated_cost' => $this->estimatedRewardCost($program),
            ])->all();
    }

    private function estimatedRewardCost(LoyaltyProgram $program): float
    {
        $config = $program->config ?? [];
        $reward = $config['reward'] ?? [];
        $usedCount = $program->rewards_used_count ?? 0;

        if (($reward['type'] ?? null) === 'service' && ! empty($reward['service_id'])) {
            $price = \App\Models\Service::find($reward['service_id'])?->price ?? 0;

            return (float) $price * $usedCount;
        }

        return (float) ($reward['value'] ?? 0) * $usedCount;
    }

    private function rewardsReport(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = LoyaltyReward::with(['client', 'program', 'service', 'usedPrestationItem.prestation.employee']);
        if (! empty($validated['from'])) {
            $query->whereDate('generated_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('generated_at', '<=', $validated['to']);
        }

        return $query->orderByDesc('generated_at')->limit(500)->get()->map(fn (LoyaltyReward $reward) => [
            'client' => $reward->client?->name,
            'reward' => $reward->program?->name,
            'generated_at' => $reward->generated_at?->toDateString(),
            'used_at' => $reward->used_at?->toDateString(),
            'employee' => $reward->usedPrestationItem?->prestation?->employee?->name,
            'service' => $reward->service?->name,
            'value' => $reward->value !== null ? (float) $reward->value : null,
            'status' => $reward->status,
        ])->all();
    }

    private function subscriptionsReport(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = ClientSubscription::with(['client', 'plan', 'usages']);
        if (! empty($validated['from'])) {
            $query->whereDate('purchased_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->whereDate('purchased_at', '<=', $validated['to']);
        }

        return $query->orderByDesc('purchased_at')->limit(500)->get()->map(fn (ClientSubscription $subscription) => [
            'plan' => $subscription->plan?->name,
            'client' => $subscription->client?->name,
            'price' => $subscription->plan !== null ? (float) $subscription->plan->price : null,
            'starts_on' => $subscription->starts_on?->toDateString(),
            'ends_on' => $subscription->ends_on?->toDateString(),
            'usages' => $subscription->usages->count(),
            'status' => $subscription->status,
        ])->all();
    }

    private function loyalClientsReport(): array
    {
        return Client::query()
            ->withCount('sales')
            ->with('loyaltyAccount')
            ->having('sales_count', '>', 0)
            ->orderByDesc('sales_count')
            ->limit(200)
            ->get()
            ->map(fn (Client $client) => [
                'client' => $client->name,
                'visits' => $client->sales_count,
                'revenue' => (float) Sale::where('client_id', $client->id)->sum('total'),
                'points' => $client->loyaltyAccount?->points_balance ?? 0,
                'rewards' => $client->loyaltyRewards()->count(),
                'last_visit' => $client->last_visit_at?->toDateString(),
            ])->all();
    }

    private function inactiveClientsReport(Request $request): array
    {
        $days = (int) $request->query('days', 60);

        return Client::query()
            ->where(fn ($q) => $q->whereNull('last_visit_at')->orWhereDate('last_visit_at', '<', now()->subDays($days)))
            ->orderBy('last_visit_at')
            ->limit(200)
            ->get()
            ->map(fn (Client $client) => [
                'client' => $client->name,
                'last_visit' => $client->last_visit_at?->toDateString() ?? 'jamais',
                'days_since' => $client->last_visit_at ? now()->diffInDays($client->last_visit_at) : null,
                'historical_revenue' => (float) Sale::where('client_id', $client->id)->sum('total'),
            ])->all();
    }

    private function streamCsv(string $name, array $rows): StreamedResponse
    {
        return Response::streamDownload(function () use ($rows) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF"); // UTF-8 BOM for Excel
            if (! empty($rows)) {
                fputcsv($handle, array_keys($rows[0]));
                foreach ($rows as $row) {
                    fputcsv($handle, $row);
                }
            }
            fclose($handle);
        }, "loyalty-{$name}.csv", ['Content-Type' => 'text/csv']);
    }
}
