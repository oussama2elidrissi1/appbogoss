import { useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipProps,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { RevenuePoint } from '@/types/dashboard';
import { formatCurrency, formatDayLabel } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from './EmptyState';

/**
 * Both series are MAD on one shared axis — never a dual-axis chart.
 * Colors: brand gold for revenue, muted red for expenses (validated pair).
 */
const REVENUE_COLOR = '#C8A24C';
const EXPENSES_COLOR = '#E5484D';

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-md border border-white/[0.10] bg-popover/95 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-md">
            <p className="text-xs font-medium text-muted-foreground">
                {formatDayLabel(String(label))}
            </p>
            <div className="mt-2 space-y-1.5">
                {payload.map((entry) => (
                    <div key={entry.dataKey} className="flex items-center gap-2.5">
                        <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-xs text-muted-foreground">
                            {entry.dataKey === 'revenue' ? 'Recettes' : 'Dépenses'}
                        </span>
                        <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(entry.value ?? 0))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
    const [period, setPeriod] = useState('14');

    const total = data.reduce((sum, point) => sum + point.revenue, 0);

    return (
        <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                    <CardTitle>Évolution du chiffre d’affaires</CardTitle>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {data.length > 0 ? (
                            <>
                                <span className="font-semibold text-foreground">
                                    {formatCurrency(total)}
                                </span>{' '}
                                sur les {data.length} derniers jours
                            </>
                        ) : (
                            'Aucune donnée sur la période'
                        )}
                    </p>
                </div>

                {/* Visual only for now — the API returns a fixed 14-day window. */}
                <Tabs value={period} onValueChange={setPeriod}>
                    <TabsList>
                        <TabsTrigger value="7">7j</TabsTrigger>
                        <TabsTrigger value="14">14j</TabsTrigger>
                        <TabsTrigger value="30">30j</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>

            <CardContent className="flex-1">
                {data.length === 0 ? (
                    <EmptyState
                        icon={TrendingUp}
                        title="Pas encore de données"
                        description="Les recettes apparaîtront ici dès le premier encaissement."
                        className="h-[280px]"
                    />
                ) : (
                    <>
                        {/* Legend — always present for 2+ series, so identity is never color-alone */}
                        <div className="mb-4 flex items-center gap-5">
                            <LegendKey color={REVENUE_COLOR} label="Recettes" />
                            <LegendKey color={EXPENSES_COLOR} label="Dépenses" />
                        </div>

                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={data}
                                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity={0.32} />
                                            <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={EXPENSES_COLOR} stopOpacity={0.18} />
                                            <stop offset="100%" stopColor={EXPENSES_COLOR} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>

                                    {/* Recessive grid — horizontal only */}
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="rgba(255,255,255,0.06)"
                                        strokeDasharray="4 4"
                                    />

                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatDayLabel}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                                        tickMargin={12}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        tickFormatter={(value: number) =>
                                            formatCurrency(value, { notation: 'compact' })
                                        }
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                                        tickMargin={8}
                                        width={56}
                                    />

                                    <Tooltip
                                        content={<ChartTooltip />}
                                        cursor={{
                                            stroke: 'rgba(200,162,76,0.45)',
                                            strokeWidth: 1,
                                            strokeDasharray: '4 4',
                                        }}
                                    />

                                    <Area
                                        type="monotone"
                                        dataKey="expenses"
                                        stroke={EXPENSES_COLOR}
                                        strokeWidth={2}
                                        fill="url(#fillExpenses)"
                                        activeDot={{
                                            r: 4,
                                            fill: EXPENSES_COLOR,
                                            stroke: '#132238',
                                            strokeWidth: 2,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke={REVENUE_COLOR}
                                        strokeWidth={2}
                                        fill="url(#fillRevenue)"
                                        activeDot={{
                                            r: 4,
                                            fill: REVENUE_COLOR,
                                            stroke: '#132238',
                                            strokeWidth: 2,
                                        }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function LegendKey({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    );
}
