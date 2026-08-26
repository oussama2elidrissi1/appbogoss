<?php

namespace App\Http\Resources;

use App\Models\Commission;
use App\Models\PrestationItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'work_day_id' => $this->work_day_id,
            'category' => $this->category,
            'total' => (float) $this->total,
            'commission_amount' => $this->commission_amount !== null ? (float) $this->commission_amount : null,
            'payment_method' => $this->payment_method,
            'print_count' => (int) $this->print_count,
            'printed_ticket_count' => (int) $this->print_count * 2,
            'created_at' => $this->created_at,
            'deleted_at' => $this->deleted_at,
            'is_deleted' => $this->trashed(),
            'client' => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
            ] : null,
            'client_label' => $this->client_label,
            'employee' => $this->employee ? [
                'id' => $this->employee->id,
                'name' => $this->employee->name,
                'avatar_color' => $this->employee->avatar_color,
            ] : [
                'id' => 0,
                'name' => 'Société',
                'avatar_color' => '#C8A24C',
            ],
            'employee_breakdown' => $this->employeeBreakdown(),
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'label' => $item->label,
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
            ])->all(),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function employeeBreakdown(): array
    {
        if ($this->resource->relationLoaded('prestation') && $this->prestation !== null) {
            return $this->prestationEmployeeBreakdown();
        }

        // A standalone product sale belongs to the register, never to an employee.
        if ($this->isQuickSaleCountedAsSale()) {
            return [];
        }

        return [[
            'employee_id' => $this->employee?->id ?? 0,
            'employee_name' => $this->employee?->name ?? 'Société',
            'employee_avatar_color' => $this->employee?->avatar_color ?? '#C8A24C',
            'tickets_count' => 1,
            'performed_count' => $this->isQuickSaleCountedAsSale() ? 0 : max(1, (int) $this->items->sum(fn ($item) => (int) $item->quantity)),
            'sales_count' => $this->isQuickSaleCountedAsSale() ? max(1, (int) $this->items->sum(fn ($item) => (int) $item->quantity)) : 0,
            'total' => (float) $this->total,
            'commission' => (float) ($this->commission_amount ?? 0),
        ]];
    }

    /** @return array<int, array<string, mixed>> */
    private function prestationEmployeeBreakdown(): array
    {
        $prestation = $this->prestation;
        $rows = [];
        $saleItems = $this->resource->relationLoaded('items') ? $this->items->values() : collect();
        $prestationItems = $prestation->relationLoaded('items') ? $prestation->items->values() : collect();

        foreach ($prestationItems as $index => $item) {
            /** @var PrestationItem $item */
            $isSaleLine = $this->isPrestationItemCountedAsSale($item);
            if ($isSaleLine) {
                continue;
            }

            $employee = $item->employee ?? $prestation->employee ?? $this->employee;
            if ($employee === null) {
                continue;
            }

            $saleItem = $saleItems->get($index);
            $total = $saleItem !== null
                ? (float) $saleItem->quantity * (float) $saleItem->unit_price
                : (float) $item->effectiveLineTotal();

            $this->addEmployeeBreakdownRow(
                $rows,
                (int) $employee->id,
                $employee->name,
                $employee->avatar_color,
                $total,
                0.0,
                max(1, (int) $item->quantity),
                0,
            );
        }

        $allocatedTotal = collect($rows)->sum('total');
        $difference = round((float) $this->total - (float) $allocatedTotal, 2);
        $hasSaleLines = $prestationItems->contains(
            fn (PrestationItem $item) => $this->isPrestationItemCountedAsSale($item),
        );
        if (! $hasSaleLines && abs($difference) >= 0.01 && count($rows) > 0) {
            $firstKey = array_key_first($rows);
            $rows[$firstKey]['total'] = round((float) $rows[$firstKey]['total'] + $difference, 2);
        }

        if ($prestation->relationLoaded('commissions') && $prestation->commissions->isNotEmpty()) {
            foreach ($prestation->commissions->where('status', Commission::STATUS_VALIDATED) as $commission) {
                $employee = $commission->employee;
                if ($employee === null) {
                    continue;
                }

                $this->addEmployeeBreakdownRow(
                    $rows,
                    (int) $employee->id,
                    $employee->name,
                    $employee->avatar_color,
                    0.0,
                    (float) $commission->amount,
                    0,
                    0,
                );
            }
        } else {
            foreach ($prestationItems as $item) {
                /** @var PrestationItem $item */
                if ($this->isPrestationItemCountedAsSale($item)) {
                    continue;
                }

                $employee = $item->employee ?? $prestation->employee ?? $this->employee;
                if ($employee === null) {
                    continue;
                }

                $this->addEmployeeBreakdownRow(
                    $rows,
                    (int) $employee->id,
                    $employee->name,
                    $employee->avatar_color,
                    0.0,
                    (float) ($item->commission_amount ?? 0),
                    0,
                    0,
                );
            }
        }

        return collect($rows)
            ->map(function (array $row) {
                $row['total'] = round((float) $row['total'], 2);
                $row['commission'] = round((float) $row['commission'], 2);

                return $row;
            })
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function addEmployeeBreakdownRow(
        array &$rows,
        int $employeeId,
        string $employeeName,
        ?string $avatarColor,
        float $total,
        float $commission,
        int $performedCount,
        int $salesCount,
    ): void {
        $rows[$employeeId] ??= [
            'employee_id' => $employeeId,
            'employee_name' => $employeeName,
            'employee_avatar_color' => $avatarColor,
            'tickets_count' => 1,
            'performed_count' => 0,
            'sales_count' => 0,
            'total' => 0.0,
            'commission' => 0.0,
        ];

        $rows[$employeeId]['performed_count'] += $performedCount;
        $rows[$employeeId]['sales_count'] += $salesCount;
        $rows[$employeeId]['total'] += $total;
        $rows[$employeeId]['commission'] += $commission;
    }

    private function isQuickSaleCountedAsSale(): bool
    {
        return in_array($this->category, ['boisson', 'vente', 'vitrine'], true)
            || $this->items->contains(fn ($item) => $item->itemable_type === Product::class);
    }

    private function isPrestationItemCountedAsSale(PrestationItem $item): bool
    {
        return $item->product_id !== null
            || in_array($item->service?->category, ['boisson', 'vente', 'vitrine'], true);
    }
}
