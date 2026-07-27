import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/**
 * Animated number. Hand-rolled on framer-motion primitives — no extra dependency.
 * Text stays in ink tokens; only the icon/trend carry color.
 */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
    const reduceMotion = useReducedMotion();
    const motionValue = useMotionValue(reduceMotion ? value : 0);
    const display = useTransform(motionValue, (latest) => format(latest));

    useEffect(() => {
        if (reduceMotion) {
            motionValue.set(value);
            return;
        }
        const controls = animate(motionValue, value, {
            duration: 0.9,
            ease: [0.16, 1, 0.3, 1],
        });
        return () => controls.stop();
    }, [value, motionValue, reduceMotion]);

    return <motion.span>{display}</motion.span>;
}

export interface KpiCardProps {
    label: string;
    value: number;
    icon: LucideIcon;
    format?: (n: number) => string;
    /** Percentage change vs. the previous period. Omit to hide the badge. */
    trend?: number | null;
    /** Secondary line under the value. */
    hint?: string;
    /** Inverts trend semantics — for costs, up is bad. */
    invertTrend?: boolean;
}

export function KpiCard({
    label,
    value,
    icon: Icon,
    format = (n) => Math.round(n).toString(),
    trend,
    hint,
    invertTrend = false,
}: KpiCardProps) {
    const hasTrend = typeof trend === 'number' && Number.isFinite(trend);
    const isUp = hasTrend && trend > 0;
    const isFlat = hasTrend && trend === 0;
    const isPositive = invertTrend ? !isUp : isUp;
    const TrendIcon = isUp ? ArrowUpRight : ArrowDownRight;

    return (
        <Card
            className={cn(
                'group relative overflow-hidden p-5',
                'transition-all duration-200 ease-out',
                'hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-soft-lg',
            )}
        >
            {/* Accent wash on hover */}
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/[0.07] via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

            <div className="relative flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/[0.10] ring-1 ring-accent/15 transition-colors duration-200 group-hover:bg-accent/[0.16]">
                    <Icon className="h-[18px] w-[18px] text-accent" />
                </span>

                {hasTrend && !isFlat && (
                    <span
                        className={cn(
                            'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                            isPositive
                                ? 'border-success/25 bg-success/[0.12] text-success'
                                : 'border-destructive/25 bg-destructive/[0.12] text-destructive',
                        )}
                    >
                        <TrendIcon className="h-3 w-3" />
                        {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
            </div>

            <div className="relative mt-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {label}
                </p>
                <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-foreground">
                    <CountUp value={value} format={format} />
                </p>
                {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
            </div>
        </Card>
    );
}
