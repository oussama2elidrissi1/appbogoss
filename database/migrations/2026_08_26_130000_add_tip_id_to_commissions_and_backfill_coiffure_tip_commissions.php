<?php

use App\Services\PosV2\PosService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('commissions', function (Blueprint $table) {
            $table->foreignId('tip_id')->nullable()->constrained('tips')->nullOnDelete();
            $table->unique('tip_id');
        });

        DB::transaction(function () {
            DB::table('tips')
                ->whereNull('deleted_at')
                ->orderBy('id')
                ->get()
                ->each(function ($tip) {
                    $line = $this->resolveTipLine($tip);
                    if ($line === null || $line->category !== 'coiffure' || $line->prestation_status !== 'paid') {
                        return;
                    }

                    $amount = round((float) $tip->amount * PosService::COIFFURE_TIP_COMMISSION_RATE / 100, 2);
                    $existing = DB::table('commissions')
                        ->whereNull('tip_id')
                        ->where('prestation_id', $tip->prestation_id)
                        ->where('prestation_item_id', $line->item_id)
                        ->where('employee_id', $tip->employee_id)
                        ->where('type', 'tip_percentage')
                        ->where('rate_or_amount', PosService::COIFFURE_TIP_COMMISSION_RATE)
                        ->where('base_amount', $tip->amount)
                        ->first();

                    if ($existing !== null) {
                        DB::table('commissions')->where('id', $existing->id)->update([
                            'tip_id' => $tip->id,
                            'updated_at' => now(),
                        ]);

                        return;
                    }

                    DB::table('commissions')->insert([
                        'prestation_id' => $tip->prestation_id,
                        'prestation_item_id' => $line->item_id,
                        'employee_id' => $tip->employee_id,
                        'service_id' => $line->service_id,
                        'tip_id' => $tip->id,
                        'rule_id' => null,
                        'type' => 'tip_percentage',
                        'rate_or_amount' => PosService::COIFFURE_TIP_COMMISSION_RATE,
                        'base_amount' => $tip->amount,
                        'amount' => $amount,
                        'status' => 'validated',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    if ($line->sale_id !== null) {
                        DB::table('sales')
                            ->where('id', $line->sale_id)
                            ->update([
                                'commission_amount' => DB::raw('COALESCE(commission_amount, 0) + '.$amount),
                            ]);
                    }
                });
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            DB::table('commissions')
                ->whereNotNull('tip_id')
                ->where('type', 'tip_percentage')
                ->orderBy('id')
                ->get()
                ->each(function ($commission) {
                    $saleId = DB::table('prestations')
                        ->where('id', $commission->prestation_id)
                        ->value('sale_id');

                    if ($saleId !== null) {
                        DB::table('sales')
                            ->where('id', $saleId)
                            ->update([
                                'commission_amount' => DB::raw('COALESCE(commission_amount, 0) - '.(float) $commission->amount),
                            ]);
                    }
                });

            DB::table('commissions')
                ->whereNotNull('tip_id')
                ->where('type', 'tip_percentage')
                ->delete();
        });

        Schema::table('commissions', function (Blueprint $table) {
            $table->dropUnique(['tip_id']);
            $table->dropConstrainedForeignId('tip_id');
        });
    }

    private function resolveTipLine(object $tip): ?object
    {
        if ($tip->prestation_item_id !== null) {
            return DB::table('prestation_items')
                ->join('prestations', 'prestations.id', '=', 'prestation_items.prestation_id')
                ->leftJoin('services', 'services.id', '=', 'prestation_items.service_id')
                ->where('prestation_items.id', $tip->prestation_item_id)
                ->select([
                    'prestation_items.id as item_id',
                    'prestation_items.service_id',
                    'services.category',
                    'prestations.status as prestation_status',
                    'prestations.sale_id',
                ])
                ->first();
        }

        $lines = DB::table('prestation_items')
            ->join('prestations', 'prestations.id', '=', 'prestation_items.prestation_id')
            ->leftJoin('services', 'services.id', '=', 'prestation_items.service_id')
            ->where('prestation_items.prestation_id', $tip->prestation_id)
            ->where(function ($query) use ($tip) {
                $query->where('prestation_items.employee_id', $tip->employee_id)
                    ->orWhere(function ($fallback) use ($tip) {
                        $fallback->whereNull('prestation_items.employee_id')
                            ->where('prestations.employee_id', $tip->employee_id);
                    });
            })
            ->select([
                'prestation_items.id as item_id',
                'prestation_items.service_id',
                'services.category',
                'prestations.status as prestation_status',
                'prestations.sale_id',
            ])
            ->get();

        return $lines->count() === 1 ? $lines->first() : null;
    }
};
