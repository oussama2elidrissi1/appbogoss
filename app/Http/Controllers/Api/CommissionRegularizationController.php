<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Employee;
use App\Models\Prestation;
use App\Models\PrestationItem;
use App\Models\Sale;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TEMPORARY one-off cleanup tool — bulk-overwrites every one of an
 * employee's historical commissions (paid Prestation items + legacy caisse
 * Sales) to a single flat rate, bypassing per-service rules and exact-label
 * matching entirely. Meant to quickly regularize old data left at 0/wrong
 * commission before the automatic calculation existed, not for ongoing use.
 *
 * Deliberately kept isolated in its own controller/route so it's a clean
 * removal later: delete this file, its route in routes/api.php, and the
 * "Régulariser (temporaire)" button in EmployeeCommissionRules.tsx.
 */
class CommissionRegularizationController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function __invoke(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'rate' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);
        $rate = (float) $validated['rate'];

        [$itemsUpdated, $salesUpdated] = DB::transaction(function () use ($employee, $rate) {
            $itemsUpdated = 0;

            $items = PrestationItem::whereHas('prestation', function ($query) use ($employee) {
                $query->where('employee_id', $employee->id)->where('status', Prestation::STATUS_PAID);
            })->get();

            foreach ($items as $item) {
                $amount = round((float) $item->lineTotal() * $rate / 100, 2);

                $item->update([
                    'commission_type' => 'percentage',
                    'commission_value' => $rate,
                    'commission_amount' => $amount,
                    'commission_rule_id' => null,
                ]);

                Commission::where('prestation_item_id', $item->id)
                    ->where('status', Commission::STATUS_VALIDATED)
                    ->update([
                        'rule_id' => null,
                        'type' => 'percentage',
                        'rate_or_amount' => $rate,
                        'amount' => $amount,
                    ]);

                $itemsUpdated++;
            }

            $linkedSaleIds = Prestation::where('employee_id', $employee->id)->whereNotNull('sale_id')->pluck('sale_id');
            $sales = Sale::where('employee_id', $employee->id)->whereNotIn('id', $linkedSaleIds)->get();

            foreach ($sales as $sale) {
                $sale->update(['commission_amount' => round((float) $sale->total * $rate / 100, 2)]);
            }

            return [$itemsUpdated, $sales->count()];
        });

        $this->activityLogger->log('commission.regularized_flat_rate', $employee, [], [
            'rate' => $rate,
            'items_updated' => $itemsUpdated,
            'sales_updated' => $salesUpdated,
        ]);

        return response()->json(['meta' => [
            'items_updated' => $itemsUpdated,
            'sales_updated' => $salesUpdated,
        ]]);
    }
}
