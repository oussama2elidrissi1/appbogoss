import { useQuery } from '@tanstack/react-query';
import { getEmployeeWalletPayments, getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Ce que cet employé a RÉELLEMENT reçu, tous portefeuilles confondus.
 *
 * Volontairement à côté des onglets « Avances » et « Paie », et surtout pas à
 * leur place : ceux-là disent ce qui est DÛ (commission gagnée, mois soldé,
 * avance à rembourser), celui-ci dit ce qui est SORTI. Les deux peuvent
 * légitimement différer — un mois soldé mais pas encore remis, une avance
 * versée d'avance — et c'est précisément parce qu'ils différaient sans que
 * personne ne puisse le voir que ce module existe.
 */
export function EmployeeWalletPayments({ employee }: { employee: Employee }) {
    const { t } = useI18n();

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['employee', employee.id, 'wallet-payments'],
        queryFn: () => getEmployeeWalletPayments(employee.id),
    });

    if (isPending) return <Skeleton className="h-40 w-full" />;

    if (isError) {
        return (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(error)}
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat
                    label={t('Total payé')}
                    value={formatCurrency(data.total_paid, { maximumFractionDigits: 2 })}
                />
                <Stat
                    label={t('Dernier paiement')}
                    value={
                        data.last_payment_amount === null
                            ? '—'
                            : formatCurrency(data.last_payment_amount, { maximumFractionDigits: 2 })
                    }
                    hint={data.last_payment_at ? formatDate(data.last_payment_at) : undefined}
                />
                <Stat label={t('Paiements')} value={String(data.payments_count)} />
            </div>

            {data.by_kind.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {data.by_kind.map((row) => (
                        <Badge key={row.kind} variant="outline">
                            {row.label}&nbsp;·&nbsp;
                            {formatCurrency(row.total, { maximumFractionDigits: 2 })}
                        </Badge>
                    ))}
                </div>
            )}

            {data.payments.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {t("Aucun paiement enregistré depuis un portefeuille. Les commissions et avances de la caisse restent visibles dans leurs propres onglets.")}
                </p>
            ) : (
                <div className="space-y-2">
                    {data.payments.map((payment) => (
                        <div
                            key={payment.id}
                            className="flex items-start justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2.5"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">
                                        {payment.category_label ?? payment.type_label}
                                    </span>
                                    {payment.period && (
                                        <Badge variant="outline">{payment.period}</Badge>
                                    )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {[payment.description, payment.reference, payment.performed_by]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums">
                                    {formatCurrency(Math.abs(payment.signed_amount), {
                                        maximumFractionDigits: 2,
                                    })}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {formatDate(payment.occurred_at)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-md border border-tint/[0.06] bg-tint/[0.025] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}
