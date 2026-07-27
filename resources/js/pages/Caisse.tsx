import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { getEmployees, getErrorMessage, getTransactions } from '@/lib/api';
import { useActiveWorkDay, useRefreshDay, workDayKeys } from '@/hooks/useWorkDay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CloseDayDialog } from '@/components/workday/CloseDayDialog';
import { DayHeader } from '@/components/workday/DayHeader';
import { DayLedger } from '@/components/workday/DayLedger';
import { OpenDayCard } from '@/components/workday/OpenDayCard';
import { QuickCheckout } from '@/components/workday/QuickCheckout';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

function CaisseSkeleton() {
    return (
        <div className="space-y-6">
            <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <div className="space-y-2.5">
                        <Skeleton className="h-6 w-56" />
                        <Skeleton className="h-4 w-72" />
                    </div>
                    <div className="flex gap-8">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-9 w-28" />
                        ))}
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <Card className="space-y-6 p-6 xl:col-span-3">
                    <Skeleton className="h-5 w-48" />
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="space-y-2.5">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-11 w-full rounded-md" />
                        </div>
                    ))}
                </Card>
                <Card className="p-6 xl:col-span-2">
                    <Skeleton className="h-5 w-44" />
                    <div className="mt-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton key={index} className="h-14 w-full rounded-md" />
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

/**
 * Caisse — the daily operations hero screen. Gated on the active work day:
 * no day open means the only thing on screen is the opening card.
 */
export default function Caisse() {
    const [closeOpen, setCloseOpen] = useState(false);
    const refreshDay = useRefreshDay();

    const { data: workDay, isPending, isError, error, refetch } = useActiveWorkDay();

    const { data: employees, isPending: employeesPending } = useQuery({
        queryKey: workDayKeys.employees,
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    // Same key as DayLedger — React Query dedupes, so the header totals stay in
    // lockstep with the list without a second request.
    const { data: sales } = useQuery({
        queryKey: workDayKeys.transactions(workDay?.id ?? 0),
        queryFn: () => getTransactions(workDay?.id ?? 0),
        enabled: Boolean(workDay),
        refetchInterval: 8000,
    });

    if (isPending) return <CaisseSkeleton />;

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger la caisse</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    Réessayer
                </Button>
            </Card>
        );
    }

    if (!workDay) return <OpenDayCard />;

    const activeSales = (sales ?? []).filter((sale) => !sale.is_deleted);
    const revenueSoFar = activeSales.reduce((sum, sale) => sum + sale.total, 0);

    return (
        <>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
                <motion.div variants={item}>
                    <DayHeader
                        workDay={workDay}
                        revenueSoFar={revenueSoFar}
                        salesCount={activeSales.length}
                        onClose={() => setCloseOpen(true)}
                    />
                </motion.div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                    <motion.div variants={item} className="xl:col-span-3">
                        <QuickCheckout
                            workDayId={workDay.id}
                            employees={employees ?? []}
                            employeesPending={employeesPending}
                            presentIds={workDay.employees
                                .filter((employee) => employee.present)
                                .map((employee) => employee.id)}
                            onSaleRecorded={refreshDay}
                        />
                    </motion.div>

                    <motion.div variants={item} className="xl:col-span-2">
                        <DayLedger workDayId={workDay.id} />
                    </motion.div>
                </div>
            </motion.div>

            <CloseDayDialog
                open={closeOpen}
                onOpenChange={setCloseOpen}
                workDay={workDay}
                onClosed={refreshDay}
            />
        </>
    );
}
