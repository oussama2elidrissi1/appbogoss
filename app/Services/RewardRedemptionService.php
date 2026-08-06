<?php

namespace App\Services;

use App\Models\LoyaltyReward;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A reward's consumption lifecycle — separate from LoyaltyEngine, which only
 * handles generation. A reward is typically earned on one sale and spent on
 * a much later one, so "reserve while building the ticket" / "confirm at
 * payment" / "release if the line is removed" are distinct concerns.
 */
class RewardRedemptionService
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function reserve(LoyaltyReward $reward, Prestation $prestation, PrestationItem $item, User $actor): void
    {
        DB::transaction(function () use ($reward, $prestation, $item, $actor) {
            $locked = LoyaltyReward::query()->whereKey($reward->id)->lockForUpdate()->firstOrFail();

            if ($prestation->client_id === null || $locked->client_id !== $prestation->client_id) {
                throw ValidationException::withMessages([
                    'loyalty_reward_id' => 'Cette récompense n’appartient pas à ce client.',
                ]);
            }

            if ($locked->status !== LoyaltyReward::STATUS_AVAILABLE) {
                throw ValidationException::withMessages([
                    'loyalty_reward_id' => 'Cette récompense n’est plus disponible.',
                ]);
            }

            if ($locked->expires_at !== null && $locked->expires_at->isPast()) {
                throw ValidationException::withMessages([
                    'loyalty_reward_id' => 'Cette récompense a expiré.',
                ]);
            }

            if ($locked->service_id !== null && $item->service_id !== $locked->service_id) {
                throw ValidationException::withMessages([
                    'loyalty_reward_id' => 'Cette récompense ne s’applique pas à ce service.',
                ]);
            }

            $locked->update([
                'status' => LoyaltyReward::STATUS_RESERVED,
                'reserved_prestation_id' => $prestation->id,
            ]);

            $publicPrice = (float) ($item->service?->price ?? $item->unit_price);
            $discount = match ($locked->type) {
                'discount_percent' => round($publicPrice * ((float) ($locked->value ?? 0)) / 100, 2),
                'discount_amount' => (float) ($locked->value ?? 0),
                default => $publicPrice, // 'service' — a fully free service
            };

            $item->update([
                'loyalty_reward_id' => $locked->id,
                'is_free' => true,
                'public_price' => $publicPrice,
                'unit_price' => max(0, $publicPrice - $discount),
            ]);

            $this->activityLogger->log('loyalty.reward_reserved', $locked, [], ['prestation_id' => $prestation->id]);
        });
    }

    public function release(LoyaltyReward $reward): void
    {
        DB::transaction(function () use ($reward) {
            $locked = LoyaltyReward::query()->whereKey($reward->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== LoyaltyReward::STATUS_RESERVED) {
                return;
            }

            $locked->update([
                'status' => LoyaltyReward::STATUS_AVAILABLE,
                'reserved_prestation_id' => null,
            ]);

            $this->activityLogger->log('loyalty.reward_released', $locked);
        });
    }

    public function confirm(LoyaltyReward $reward, PrestationItem $item): void
    {
        $locked = LoyaltyReward::query()->whereKey($reward->id)->lockForUpdate()->firstOrFail();

        if ($locked->status !== LoyaltyReward::STATUS_RESERVED || $locked->reserved_prestation_id !== $item->prestation_id) {
            throw ValidationException::withMessages([
                'loyalty_reward_id' => 'Cette récompense n’est plus valide pour cette prestation.',
            ]);
        }

        $locked->update([
            'status' => LoyaltyReward::STATUS_USED,
            'used_at' => now(),
            'used_prestation_item_id' => $item->id,
        ]);

        $this->activityLogger->log('loyalty.reward_used', $locked, [], ['prestation_item_id' => $item->id]);
    }

    public function reverseConsumption(Prestation $prestation): void
    {
        $prestation->loadMissing('items');

        foreach ($prestation->items as $item) {
            if ($item->loyalty_reward_id === null) {
                continue;
            }

            $reward = LoyaltyReward::query()->whereKey($item->loyalty_reward_id)->lockForUpdate()->first();
            if ($reward === null || $reward->status !== LoyaltyReward::STATUS_USED) {
                continue;
            }

            $reward->update([
                'status' => LoyaltyReward::STATUS_AVAILABLE,
                'used_at' => null,
                'used_prestation_item_id' => null,
            ]);

            $this->activityLogger->log('loyalty.reward_use_reversed', $reward, [], ['prestation_id' => $prestation->id]);
        }
    }
}
