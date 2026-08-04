import { useQuery } from '@tanstack/react-query';
import { getErrorMessage, getPrestations } from '@/lib/api';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import type { PrestationStatus } from '@/types/prestation';

const STATUS_META: Record<PrestationStatus, { label: string; variant: BadgeProps['variant'] }> = {
    draft: { label: 'Brouillon', variant: 'outline' },
    in_progress: { label: 'En cours', variant: 'default' },
    services_done: { label: 'Services terminés', variant: 'default' },
    pending_payment: { label: 'En attente de paiement', variant: 'accent' },
    paid: { label: 'Payée', variant: 'success' },
    cancelled: { label: 'Annulée', variant: 'outline' },
    refunded: { label: 'Remboursée', variant: 'destructive' },
};

export function MyPrestationsList() {
    const { data: prestations, isPending, isError, error } = useQuery({
        queryKey: ['prestations', 'mine'],
        queryFn: () => getPrestations(),
    });

    if (isPending) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
            </Card>
        );
    }

    if (!prestations || prestations.length === 0) {
        return (
            <EmptyState
                icon={Receipt}
                title="Aucune prestation"
                description="Vos prestations créées apparaîtront ici avec leur statut."
            />
        );
    }

    return (
        <div className="space-y-2.5">
            {prestations.map((prestation) => {
                const meta = STATUS_META[prestation.status];
                return (
                    <Card key={prestation.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                                {prestation.reference} · {prestation.client_name ?? 'Client de passage'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatDate(prestation.created_at)} {formatTime(prestation.created_at)} ·{' '}
                                {prestation.items.length} service
                                {prestation.items.length > 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold tabular-nums">{formatCurrency(prestation.total)}</span>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
