import { useQuery } from '@tanstack/react-query';
import { getMyDashboard } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MyDashboardSummary() {
    const { t } = useI18n();
    const { data, isPending } = useQuery({
        queryKey: ['me', 'dashboard'],
        queryFn: getMyDashboard,
        refetchInterval: 30_000,
    });

    if (isPending || !data) {
        return (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-md" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("Prestations aujourd'hui")}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{data.prestations_today_count}</p>
            </Card>
            <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t('Chiffre du jour')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(data.revenue_today)}</p>
            </Card>
            <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t('Commission du jour')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                    {formatCurrency(data.commission_today)}
                </p>
            </Card>
            <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t('Commission du mois')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                    {formatCurrency(data.commission_month)}
                </p>
            </Card>
        </div>
    );
}
