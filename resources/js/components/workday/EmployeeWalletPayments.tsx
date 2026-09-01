import { useQuery } from '@tanstack/react-query';
import { getEmployeeWalletPayments, getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import type { EmployeePaymentRow } from '@/types/wallet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentSourceTag } from '@/components/workday/PaymentSourceNotice';

/**
 * Ce que cet employé a RÉELLEMENT reçu, avec la source de chaque versement.
 *
 * Volontairement à côté des onglets « Avances » et « Paie », et surtout pas à
 * leur place : ceux-là disent ce qui est DÛ (commission gagnée, mois soldé,
 * avance à rembourser), celui-ci dit ce qui est SORTI, et d'où.
 *
 * La colonne Source est le cœur de l'écran. Un même montant de 3 000 DH n'a
 * pas les mêmes conséquences comptables selon qu'il est sorti du tiroir (il a
 * réduit le résultat de la journée) ou du portefeuille (il ne l'a pas réduit,
 * ce résultat ayant déjà été crédité à l'admin).
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                    label={t('Total payé')}
                    value={formatCurrency(data.total_paid, { maximumFractionDigits: 2 })}
                />
                <Stat
                    label={t('Dont portefeuille')}
                    value={formatCurrency(data.wallet_total, { maximumFractionDigits: 2 })}
                />
                <Stat
                    label={t('Dont caisse')}
                    value={formatCurrency(data.caisse_total, { maximumFractionDigits: 2 })}
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
                    {t("Aucun versement enregistré pour cet employé, ni depuis un portefeuille, ni depuis la caisse.")}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                <th className="px-2 py-2 font-semibold">{t('Date')}</th>
                                <th className="px-2 py-2 font-semibold">{t('Motif')}</th>
                                <th className="px-2 py-2 text-right font-semibold">{t('Montant')}</th>
                                <th className="px-2 py-2 font-semibold">{t('Source')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.payments.map((payment) => (
                                <PaymentRow key={payment.id} payment={payment} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function PaymentRow({ payment }: { payment: EmployeePaymentRow }) {
    const { t } = useI18n();

    return (
        <tr className="border-t border-tint/[0.06]">
            <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">
                {payment.occurred_at ? formatDate(payment.occurred_at) : '—'}
            </td>
            <td className="px-2 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{payment.kind_label}</span>
                    {payment.period && <Badge variant="outline">{payment.period}</Badge>}
                </div>
                {(payment.label || payment.performed_by || payment.work_day_date) && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                            payment.label,
                            payment.work_day_date
                                ? `${t('journée du')} ${formatDate(payment.work_day_date)}`
                                : null,
                            payment.performed_by,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                )}
            </td>
            <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums">
                {formatCurrency(payment.amount, { maximumFractionDigits: 2 })}
            </td>
            <td className="px-2 py-2.5">
                <PaymentSourceTag source={payment.source} />
            </td>
        </tr>
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
