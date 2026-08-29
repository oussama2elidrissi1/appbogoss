<?php

use App\Services\PosV2\PosService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tips handed to an employee for the whole ticket (no prestation_item_id,
 * which is what the checkout sends as soon as that employee holds several
 * lines) never produced their 50% coiffure commission: the service and the
 * 2026_08_26 backfill both gave up unless the tip resolved to exactly one
 * line. PosService::coiffureTipBasis() now splits them; this catches up the
 * invoices already paid.
 *
 * Idempotent: a tip that already carries a commission (commissions.tip_id is
 * unique) is skipped, so re-running changes nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            DB::table('tips')
                ->whereNull('deleted_at')
                ->whereNotExists(fn ($query) => $query
                    ->selectRaw('1')
                    ->from('commissions')
                    ->whereColumn('commissions.tip_id', 'tips.id'))
                ->orderBy('id')
                ->get()
                ->each(function ($tip) {
                    $prestation = DB::table('prestations')->where('id', $tip->prestation_id)->first();
                    if ($prestation === null || $prestation->status !== 'paid') {
                        return;
                    }

                    [$line, $base] = $this->coiffureTipBasis($tip);
                    if ($line === null || $base <= 0) {
                        return;
                    }

                    $amount = round($base * PosService::COIFFURE_TIP_COMMISSION_RATE / 100, 2);

                    DB::table('commissions')->insert([
                        'prestation_id' => $tip->prestation_id,
                        'prestation_item_id' => $line->id,
                        'employee_id' => $tip->employee_id,
                        'service_id' => $line->service_id,
                        'tip_id' => $tip->id,
                        'rule_id' => null,
                        'type' => 'tip_percentage',
                        'rate_or_amount' => PosService::COIFFURE_TIP_COMMISSION_RATE,
                        'base_amount' => $base,
                        'amount' => $amount,
                        'status' => 'validated',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    if ($prestation->sale_id !== null) {
                        DB::table('sales')
                            ->where('id', $prestation->sale_id)
                            ->update([
                                'commission_amount' => DB::raw('COALESCE(commission_amount, 0) + '.$amount),
                            ]);
                    }
                });
        });
    }

    /**
     * Not reversible on purpose: the rows it writes are indistinguishable
     * from the ones the checkout writes itself, and deleting those would
     * strip commissions employees have already been paid on.
     */
    public function down(): void {}

    /**
     * Mirror of PosService::coiffureTipBasis() over raw rows: the line the
     * commission hangs on and the coiffure share of the tip.
     *
     * @return array{0: ?object, 1: float}
     */
    private function coiffureTipBasis(object $tip): array
    {
        $amount = (float) $tip->amount;

        if ($tip->prestation_item_id !== null) {
            $line = $this->lines($tip->prestation_id)->firstWhere('id', $tip->prestation_item_id);

            return $line !== null && $line->category === 'coiffure' ? [$line, $amount] : [null, 0.0];
        }

        // Same fallback as the 2026_08_26 backfill: a line with no employee
        // belongs to the ticket's owner.
        $employeeLines = $this->lines($tip->prestation_id)->filter(
            fn ($line) => (int) ($line->employee_id ?? $line->prestation_employee_id ?? 0) === (int) $tip->employee_id,
        );
        $coiffureLines = $employeeLines->filter(fn ($line) => $line->category === 'coiffure');
        if ($coiffureLines->isEmpty()) {
            return [null, 0.0];
        }

        $linesTotal = round($employeeLines->sum(fn ($line) => $this->lineValue($line)), 2);
        $share = $linesTotal > 0
            ? round($coiffureLines->sum(fn ($line) => $this->lineValue($line)), 2) / $linesTotal
            : $coiffureLines->count() / max(1, $employeeLines->count());

        return [
            $coiffureLines->sortByDesc(fn ($line) => $this->lineValue($line))->first(),
            round($amount * $share, 2),
        ];
    }

    private function lineValue(object $line): float
    {
        if ((int) $line->is_free === 1) {
            return 0.0;
        }

        $total = round(max(1, (int) $line->quantity) * (float) $line->unit_price, 2);

        return round(max(0.0, $total - min((float) ($line->discount_amount ?? 0), $total)), 2);
    }

    /** @return \Illuminate\Support\Collection<int, object> */
    private function lines(int $prestationId): \Illuminate\Support\Collection
    {
        return DB::table('prestation_items')
            ->join('prestations', 'prestations.id', '=', 'prestation_items.prestation_id')
            ->leftJoin('services', 'services.id', '=', 'prestation_items.service_id')
            ->where('prestation_items.prestation_id', $prestationId)
            ->select([
                'prestation_items.id',
                'prestation_items.service_id',
                'prestation_items.employee_id',
                'prestation_items.quantity',
                'prestation_items.unit_price',
                'prestation_items.discount_amount',
                'prestation_items.is_free',
                'services.category',
                'prestations.employee_id as prestation_employee_id',
            ])
            ->get();
    }
};
