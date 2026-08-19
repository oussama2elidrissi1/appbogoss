import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Ban, CheckCircle2, Clock3, Wallet } from 'lucide-react';
import { getErrorMessage, getPartnerPortalCommissions } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { PartnerCommissionStatus } from '@/types/partner-portal';

const STATUS_META: Record<PartnerCommissionStatus, { label: string; icon: typeof Clock3; variant: 'outline' | 'success' | 'destructive' }> = {
    validated: { label: 'Validée', icon: Clock3, variant: 'outline' },
    paid: { label: 'Payée', icon: CheckCircle2, variant: 'success' },
    cancelled: { label: 'Annulée', icon: Ban, variant: 'destructive' },
};

export default function PartnerCommissions() {
    const [status, setStatus] = useState<'all' | PartnerCommissionStatus>('all');

    const { data, isPending, isError, error, refetch } = useQuery({
        queryKey: ['partner-portal', 'commissions', status],
        queryFn: () => getPartnerPortalCommissions(status !== 'all' ? status : undefined),
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Mes commissions</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Estimées, validées puis payées — le détail de tout ce que BOGOSLAND vous doit.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Estimées</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                        {isPending ? <Skeleton className="h-6 w-24" /> : formatCurrency(data?.meta.estimated_total ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Réservations pas encore honorées</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Validées</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                        {isPending ? <Skeleton className="h-6 w-24" /> : formatCurrency(data?.meta.validated_total ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Acquises, en attente de paiement</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Payées</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-success">
                        {isPending ? <Skeleton className="h-6 w-24" /> : formatCurrency(data?.meta.paid_total ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Déjà réglées par BOGOSLAND</p>
                </Card>
            </div>

            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Historique</h2>
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                    <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tous les statuts</SelectItem>
                        <SelectItem value="validated">Validées</SelectItem>
                        <SelectItem value="paid">Payées</SelectItem>
                        <SelectItem value="cancelled">Annulées</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                    <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                        Réessayer
                    </Button>
                </Card>
            ) : !data || data.data.length === 0 ? (
                <EmptyState
                    icon={Wallet}
                    title="Aucune commission"
                    description="Vos commissions validées apparaîtront ici dès qu'un de vos clients aura été servi et payé au salon."
                />
            ) : (
                <>
                    <Card className="hidden overflow-hidden lg:block">
                        <table className="w-full text-sm">
                            <thead className="border-b border-tint/[0.06] bg-tint/[0.02] text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Référence</th>
                                    <th className="px-4 py-3 font-medium">Client</th>
                                    <th className="px-4 py-3 font-medium">Service</th>
                                    <th className="px-4 py-3 text-right font-medium">Montant</th>
                                    <th className="px-4 py-3 text-right font-medium">Taux</th>
                                    <th className="px-4 py-3 text-right font-medium">Commission</th>
                                    <th className="px-4 py-3 font-medium">Statut</th>
                                    <th className="px-4 py-3 font-medium">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => {
                                    const meta = STATUS_META[row.status];
                                    return (
                                        <tr key={row.id} className="border-b border-tint/[0.04] last:border-0">
                                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                                {row.prestation_reference ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 font-medium">{row.client_name ?? '—'}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{row.service_name ?? '—'}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {formatCurrency(row.base_amount)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                                {row.type === 'percentage'
                                                    ? `${row.rate_or_amount}%`
                                                    : row.type === 'fixed'
                                                      ? formatCurrency(row.rate_or_amount ?? 0, { maximumFractionDigits: 2 })
                                                      : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium tabular-nums text-accent">
                                                {formatCurrency(row.amount, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={meta.variant} className="gap-1.5">
                                                    <meta.icon className="h-3 w-3" />
                                                    {meta.label}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {row.paid_at ? formatDate(row.paid_at) : row.created_at ? formatDate(row.created_at) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Card>

                    <div className="space-y-2 lg:hidden">
                        {data.data.map((row) => {
                            const meta = STATUS_META[row.status];
                            return (
                                <Card key={row.id} className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{row.client_name ?? '—'}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {row.service_name ?? '—'}
                                            </p>
                                        </div>
                                        <Badge variant={meta.variant} className={cn('shrink-0 gap-1.5')}>
                                            <meta.icon className="h-3 w-3" />
                                            {meta.label}
                                        </Badge>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{row.created_at ? formatDate(row.created_at) : ''}</span>
                                        <span className="text-sm font-semibold text-accent">
                                            {formatCurrency(row.amount, { maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </>
            )}
        </motion.div>
    );
}
