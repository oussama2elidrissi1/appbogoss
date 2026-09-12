import { getCategoryLabel } from '@/components/workday/categories';
import { useI18n } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';
import type { SandboxReport, SandboxReportRow } from '@/lib/posSandbox';

/**
 * Le rapport de la journée de TEST, dessiné comme celui des Rapports pour
 * qu'un essai ressemble à la réalité. Il est calculé en mémoire par
 * `buildReport()` et n'est écrit nulle part : fermer l'onglet l'efface.
 */
export function SandboxDayReport({ report }: { report: SandboxReport }) {
    const { t } = useI18n();

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Stat label={t('CA')} value={formatCurrency(report.revenue_total)} />
                <Stat label={t('Dépenses')} value={formatCurrency(report.expenses_total)} />
                <Stat label={t('Avances')} value={formatCurrency(report.advances_total)} />
                <Stat
                    label={t('Résultat de la caisse')}
                    value={formatCurrency(report.net_result)}
                    accent
                />
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Stat label={t('Fond de caisse')} value={formatCurrency(report.opening_balance)} />
                <Stat label={t('Attendu en tiroir')} value={formatCurrency(report.cash_expected)} />
                <Stat label={t('Tickets')} value={`${report.ticket_count}`} />
                <Stat label={t('Ticket moyen')} value={formatCurrency(report.average_ticket)} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Section title={t('Par catégorie')}>
                    <Rows rows={report.revenue_by_category} labelOf={(row) => t(getCategoryLabel(row.label))} />
                </Section>
                <Section title={t('Par employé')}>
                    <Rows rows={report.revenue_by_employee} labelOf={(row) => row.label} />
                </Section>
                <Section title={t('Top prestations')}>
                    <Rows
                        rows={report.top_prestations}
                        labelOf={(row) => row.label}
                        hintOf={(row) =>
                            `${row.count} ${t(row.count > 1 ? 'passages' : 'passage')}`
                        }
                    />
                </Section>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Section title={t('Moyens de paiement')}>
                    <Rows rows={report.payment_methods} labelOf={(row) => t(row.label)} />
                </Section>
                <Section title={t('Dépenses détaillées')}>
                    {report.expenses_detail.length === 0 ? (
                        <Empty>{t('Aucune dépense sur cette journée de test.')}</Empty>
                    ) : (
                        report.expenses_detail.map((expense) => (
                            <Line
                                key={expense.id}
                                label={expense.label}
                                hint={t(getCategoryLabel(expense.category))}
                                value={formatCurrency(expense.amount)}
                            />
                        ))
                    )}
                </Section>
                <Section title={t('Avances détaillées')}>
                    {report.advances_detail.length === 0 ? (
                        <Empty>{t('Aucune avance sur cette journée de test.')}</Empty>
                    ) : (
                        report.advances_detail.map((advance) => (
                            <Line
                                key={advance.id}
                                label={advance.employee_name}
                                hint={advance.reason}
                                value={formatCurrency(advance.amount)}
                            />
                        ))
                    )}
                </Section>
            </div>

            <p className="text-xs text-muted-foreground">
                {t(
                    'Commissions estimées à {amount} avec le taux par défaut de chaque employé — la vraie caisse applique d’abord les règles par service.',
                    { amount: formatCurrency(report.commissions_total) },
                )}
            </p>
        </div>
    );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
                className={
                    accent
                        ? 'mt-1 font-display text-xl font-bold tabular-nums text-accent'
                        : 'mt-1 font-display text-xl font-bold tabular-nums text-foreground'
                }
            >
                {value}
            </p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function Rows({
    rows,
    labelOf,
    hintOf,
}: {
    rows: SandboxReportRow[];
    labelOf: (row: SandboxReportRow) => string;
    hintOf?: (row: SandboxReportRow) => string;
}) {
    const { t } = useI18n();

    if (rows.length === 0) return <Empty>{t('Rien à afficher.')}</Empty>;

    return (
        <>
            {rows.map((row) => (
                <Line
                    key={row.key}
                    label={labelOf(row)}
                    hint={hintOf?.(row)}
                    value={formatCurrency(row.total)}
                />
            ))}
        </>
    );
}

function Line({ label, hint, value }: { label: string; hint?: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2">
            <div className="min-w-0">
                <p className="truncate text-sm">{label}</p>
                {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-md border border-dashed border-tint/[0.1] px-3 py-2 text-xs text-muted-foreground">
            {children}
        </p>
    );
}
