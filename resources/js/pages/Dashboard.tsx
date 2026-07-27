import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarDays, Receipt, UserSquare2, Users, Wallet } from 'lucide-react';
import { getDashboard, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { LowStockCard } from '@/components/dashboard/LowStockCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { AppointmentQueueCard } from '@/components/dashboard/AppointmentQueueCard';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
    },
};

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
}

export default function Dashboard() {
    const { user } = useAuth();
    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['dashboard'],
        queryFn: getDashboard,
    });

    if (isPending) return <DashboardSkeleton />;

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger le tableau de bord</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    Réessayer
                </Button>
            </Card>
        );
    }

    const { kpis, revenue_series, low_stock_products, recent_activity, appointment_queue } = data;

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            {/* Page heading */}
            <motion.div variants={item}>
                <h2 className="text-2xl font-semibold tracking-tight">
                    {greeting()}
                    {user ? `, ${user.name.split(' ')[0]}` : ''}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Voici l’activité de votre salon aujourd’hui.
                </p>
            </motion.div>

            {/* KPI row */}
            <motion.div
                variants={item}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
            >
                <KpiCard
                    label="CA du jour"
                    value={kpis.revenue_today}
                    icon={Wallet}
                    format={(n) => formatCurrency(n)}
                    trend={kpis.revenue_trend_pct}
                    hint={`${formatCurrency(kpis.revenue_month)} ce mois-ci`}
                />
                <KpiCard
                    label="Rendez-vous"
                    value={kpis.appointments_today}
                    icon={CalendarDays}
                    format={(n) => formatNumber(Math.round(n))}
                    trend={kpis.appointments_trend_pct}
                    hint="Programmés aujourd’hui"
                />
                <KpiCard
                    label="Clients"
                    value={kpis.clients_total}
                    icon={Users}
                    format={(n) => formatNumber(Math.round(n))}
                    hint={`+${formatNumber(kpis.clients_new_this_month)} ce mois-ci`}
                />
                <KpiCard
                    label="Employés actifs"
                    value={kpis.employees_active}
                    icon={UserSquare2}
                    format={(n) => formatNumber(Math.round(n))}
                    hint="En service"
                />
                <KpiCard
                    label="Dépenses du mois"
                    value={kpis.expenses_month}
                    icon={Receipt}
                    format={(n) => formatCurrency(n)}
                    hint="Charges cumulées"
                />
            </motion.div>

            {/* Main grid */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <motion.div variants={item}>
                        <RevenueChart data={revenue_series} />
                    </motion.div>
                    <motion.div variants={item}>
                        <RecentActivityCard items={recent_activity} />
                    </motion.div>
                </div>

                <div className="space-y-6">
                    <motion.div variants={item}>
                        <AppointmentQueueCard appointments={appointment_queue} />
                    </motion.div>
                    <motion.div variants={item}>
                        <LowStockCard products={low_stock_products} />
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
