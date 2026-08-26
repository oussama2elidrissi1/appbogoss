import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Clock3, Coffee, Filter, type LucideIcon, ReceiptText, Search, ShoppingBag, ShoppingCart, WalletCards } from 'lucide-react';
import { getEmployees, getServices } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { getPos2History, pos2Keys } from '@/lib/pos2Api';
import { paymentMethodLabel } from '@/lib/receiptV2';
import { pageFade } from '@/lib/motion';
import { CATEGORIES } from '@/components/workday/categories';
import { Pos2InvoiceDetailDrawer, STATUS_META } from '@/components/pos2/Pos2InvoiceDetailDrawer';
import { useActiveWorkDay } from '@/hooks/useWorkDay';
import { cn, formatCurrency } from '@/lib/utils';
import type { Pos2HistoryFilters, Pos2InvoiceStatus } from '@/types/pos2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/** §23 — presets horaires de l'accueil. */
const HOUR_PRESETS: Array<{ label: string; from?: string; to?: string }> = [
    { label: 'Toute la journée' },
    { label: '07:00 – 09:00', from: '07:00', to: '09:00' },
    { label: '09:00 – 12:00', from: '09:00', to: '12:00' },
    { label: '12:00 – 15:00', from: '12:00', to: '15:00' },
    { label: '15:00 – 18:00', from: '15:00', to: '18:00' },
    { label: '18:00 – fermeture', from: '18:00', to: '23:59' },
];

const ALL = '__all__';
const ACTIVE_DAY = 'active_day';
const DATE_RANGE = 'date_range';

/**
 * §34 — HISTORIQUE CAISSE V2 : filtres date/heure/service/catégorie/employé/
 * statut/paiement/abonnement + recherche, liste et drawer de détail.
 */
export default function PosV2History() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [historyScope, setHistoryScope] = useState<typeof ACTIVE_DAY | typeof DATE_RANGE>(ACTIVE_DAY);
    const [hourPreset, setHourPreset] = useState(0);
    const [customHours, setCustomHours] = useState(false);
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo, setTimeTo] = useState('');
    const [status, setStatus] = useState(ALL);
    const [paymentMethod, setPaymentMethod] = useState(ALL);
    const [serviceId, setServiceId] = useState(ALL);
    const [category, setCategory] = useState(ALL);
    const [employeeId, setEmployeeId] = useState(ALL);
    const [subscription, setSubscription] = useState(ALL);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [detailId, setDetailId] = useState<number | null>(null);
    const { t } = useI18n();

    const { data: activeWorkDay } = useActiveWorkDay();
    const { data: employees } = useQuery({ queryKey: ['employees'], queryFn: () => getEmployees(), staleTime: 5 * 60_000 });
    const { data: services } = useQuery({ queryKey: ['services', 'pos2', 'all'], queryFn: () => getServices(), staleTime: 5 * 60_000 });

    const filters: Pos2HistoryFilters = useMemo(() => {
        const preset = HOUR_PRESETS[hourPreset];
        const useActiveDay = historyScope === ACTIVE_DAY && activeWorkDay?.id;
        return {
            from: useActiveDay ? undefined : from,
            to: useActiveDay ? undefined : to,
            work_day_id: useActiveDay ? activeWorkDay.id : undefined,
            time_from: customHours ? timeFrom || undefined : preset?.from,
            time_to: customHours ? timeTo || undefined : preset?.to,
            status: status === ALL ? undefined : status,
            payment_method: paymentMethod === ALL ? undefined : paymentMethod,
            service_id: serviceId === ALL ? undefined : Number(serviceId),
            category: category === ALL ? undefined : category,
            employee_id: employeeId === ALL ? undefined : Number(employeeId),
            subscription: subscription === ALL ? undefined : subscription === 'yes',
            search: search.trim() || undefined,
            page,
        };
    }, [activeWorkDay?.id, from, to, historyScope, hourPreset, customHours, timeFrom, timeTo, status, paymentMethod, serviceId, category, employeeId, subscription, search, page]);

    const { data, isPending } = useQuery({
        queryKey: pos2Keys.history(filters),
        queryFn: () => getPos2History(filters),
        placeholderData: keepPreviousData,
    });

    const invoices = data?.data ?? [];
    const meta = data?.meta;
    const stats = meta?.stats;
    const performedTotal = stats?.employees.reduce((sum, employee) => sum + employee.performed_count, 0) ?? 0;
    const salesCount = stats?.sales_count ?? 0;
    const salesByArea = stats?.sales_by_area ?? [];

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Historique caisse')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('Factures Caisse V2 — filtrez par heure, service, employé ou moyen de paiement.')}
                    </p>
                </div>
                <Button type="button" variant="outline" asChild>
                    <Link to="/pos-v2">
                        <ArrowLeft />
                        {t('Retour à la caisse')}
                    </Link>
                </Button>
            </div>

            {/* -------------------------------------------------- filtres */}
            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Chip
                            size="sm"
                            selected={historyScope === ACTIVE_DAY}
                            onClick={() => { setHistoryScope(ACTIVE_DAY); setPage(1); }}
                        >
                            {t('Journée active')}{activeWorkDay?.date ? ` · ${activeWorkDay.date}` : ''}
                        </Chip>
                        <Chip
                            size="sm"
                            selected={historyScope === DATE_RANGE}
                            onClick={() => { setHistoryScope(DATE_RANGE); setPage(1); }}
                        >
                            {t('Par date')}
                        </Chip>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                        <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('Du')}</Label>
                            <Input
                                type="date"
                                value={from}
                                disabled={historyScope === ACTIVE_DAY && Boolean(activeWorkDay?.id)}
                                onChange={(event) => { setFrom(event.target.value); setPage(1); }}
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('Au')}</Label>
                            <Input
                                type="date"
                                value={to}
                                disabled={historyScope === ACTIVE_DAY && Boolean(activeWorkDay?.id)}
                                onChange={(event) => { setTo(event.target.value); setPage(1); }}
                                className="h-10"
                            />
                        </div>
                        <FilterSelect
                            label={t('Statut')}
                            value={status}
                            onChange={(value) => { setStatus(value); setPage(1); }}
                            options={[
                                { value: ALL, label: 'Tous' },
                                { value: 'paid', label: 'Payée' },
                                { value: 'in_progress', label: 'Ouverte' },
                                { value: 'pending_payment', label: 'En caisse' },
                                { value: 'cancelled', label: 'Annulée' },
                                { value: 'refunded', label: 'Remboursée' },
                            ]}
                        />
                        <FilterSelect
                            label={t('Paiement')}
                            value={paymentMethod}
                            onChange={(value) => { setPaymentMethod(value); setPage(1); }}
                            options={[
                                { value: ALL, label: 'Tous' },
                                { value: 'especes', label: 'Espèces' },
                                { value: 'carte', label: 'Carte' },
                                { value: 'virement', label: 'Virement' },
                                { value: 'mixte', label: 'Mixte' },
                                { value: 'autre', label: 'Autre' },
                            ]}
                        />
                        <FilterSelect
                            label={t('Service')}
                            value={serviceId}
                            onChange={(value) => { setServiceId(value); setPage(1); }}
                            options={[
                                { value: ALL, label: 'Tous' },
                                ...(services ?? []).map((service) => ({ value: String(service.id), label: service.name })),
                            ]}
                        />
                        <FilterSelect
                            label={t('Employé')}
                            value={employeeId}
                            onChange={(value) => { setEmployeeId(value); setPage(1); }}
                            options={[
                                { value: ALL, label: 'Tous' },
                                ...(employees ?? []).map((employee) => ({ value: String(employee.id), label: employee.name })),
                            ]}
                        />
                    </div>

                    {/* Heure (§23) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                        {HOUR_PRESETS.map((preset, index) => (
                            <Chip
                                key={preset.label}
                                size="sm"
                                selected={!customHours && hourPreset === index}
                                onClick={() => { setCustomHours(false); setHourPreset(index); setPage(1); }}
                            >
                                {t(preset.label)}
                            </Chip>
                        ))}
                        <Chip size="sm" selected={customHours} onClick={() => { setCustomHours(true); setPage(1); }}>
                            {t('Personnalisé')}
                        </Chip>
                        {customHours && (
                            <span className="flex items-center gap-1.5">
                                <Input type="time" value={timeFrom} onChange={(event) => { setTimeFrom(event.target.value); setPage(1); }} className="h-9 w-28" />
                                <span className="text-xs text-muted-foreground">{t('à')}</span>
                                <Input type="time" value={timeTo} onChange={(event) => { setTimeTo(event.target.value); setPage(1); }} className="h-9 w-28" />
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Chip size="sm" selected={category === ALL} onClick={() => { setCategory(ALL); setPage(1); }}>
                            {t('Toutes catégories')}
                        </Chip>
                        {CATEGORIES.map((config) => (
                            <Chip
                                key={config.value}
                                size="sm"
                                selected={category === config.value}
                                onClick={() => { setCategory(config.value); setPage(1); }}
                            >
                                {t(config.label)}
                            </Chip>
                        ))}
                        <span className="mx-1 h-4 w-px bg-tint/[0.12]" />
                        <Chip size="sm" selected={subscription === ALL} onClick={() => { setSubscription(ALL); setPage(1); }}>
                            {t('Tout')}
                        </Chip>
                        <Chip size="sm" selected={subscription === 'yes'} onClick={() => { setSubscription('yes'); setPage(1); }}>
                            {t('Abonnement')}
                        </Chip>
                        <Chip size="sm" selected={subscription === 'no'} onClick={() => { setSubscription('no'); setPage(1); }}>
                            {t('Normal')}
                        </Chip>
                    </div>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                        <Input
                            value={search}
                            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                            placeholder={t('Rechercher une facture (référence, client)…')}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* -------------------------------------------------- statistiques */}
            {stats && (
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-foreground">{t('Statistiques filtrées')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('Calculées sur toutes les factures du filtre, pas seulement la page affichée.')}
                                </p>
                            </div>
                            <Badge variant="outline">
                                V1 {stats.v1_count} · V2 {stats.v2_count}
                            </Badge>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <StatTile icon={WalletCards} label={t('CA encaissé')} value={formatCurrency(stats.paid_total)} />
                            <StatTile icon={ReceiptText} label={t('Prestations effectuées')} value={String(performedTotal)} />
                            <StatTile
                                icon={ShoppingCart}
                                label={t('Ventes')}
                                value={`${salesCount} · ${formatCurrency(stats.sales_total)}`}
                            />
                            <StatTile
                                icon={BarChart3}
                                label={t('Moyenne facture')}
                                value={formatCurrency(stats.paid_count > 0 ? stats.paid_total / stats.paid_count : 0)}
                            />
                        </div>

                        {(stats.employees.length > 0 || salesByArea.length > 0) && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t('CA par employé')}
                                </p>
                                <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                                    {stats.employees.map((employee, index) => (
                                        <div
                                            key={employee.employee_id}
                                            className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3 py-2.5"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">
                                                        #{index + 1} {employee.employee_name}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {employee.performed_count} {t(employee.performed_count > 1 ? 'prestations' : 'prestation')}
                                                    </p>
                                                </div>
                                                <p className="shrink-0 text-sm font-bold tabular-nums text-accent">
                                                    {formatCurrency(employee.total)}
                                                </p>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-tint/[0.06] pt-2 text-[11px]">
                                                <span className="text-muted-foreground">
                                                    {t('Factures')}{' '}
                                                    <span className="font-medium text-foreground">
                                                        {employee.invoices_count}
                                                    </span>
                                                </span>
                                                <span className="text-right text-muted-foreground">
                                                    {t('Comm.')}{' '}
                                                    <span className="font-medium text-foreground">
                                                        {formatCurrency(employee.commission_total)}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {salesByArea.map((area) => {
                                        const isFridge = area.area === 'refrigerateur';
                                        const Icon = isFridge ? Coffee : ShoppingBag;
                                        const label = isFridge ? t('Réfrigérateur') : t('Vente');

                                        return (
                                            <div
                                                key={area.area}
                                                className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3 py-2.5"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Icon className={cn('h-4 w-4 shrink-0', isFridge ? 'text-success' : 'text-rose-600 dark:text-rose-300')} />
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {area.count} {t(area.count > 1 ? 'ventes' : 'vente')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="shrink-0 text-sm font-bold tabular-nums text-accent">
                                                        {formatCurrency(area.total)}
                                                    </p>
                                                </div>
                                                <div className="mt-2 border-t border-tint/[0.06] pt-2 text-[11px] text-muted-foreground">
                                                    {t('Société')}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* -------------------------------------------------- résultats */}
            <Card>
                <CardContent className="p-0">
                    {isPending ? (
                        <div className="space-y-2 p-4">
                            {[0, 1, 2, 3, 4].map((index) => (
                                <Skeleton key={index} className="h-14 w-full" />
                            ))}
                        </div>
                    ) : invoices.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {t('Aucune facture ne correspond à ces filtres.')}
                        </p>
                    ) : (
                        <ul className="divide-y divide-tint/[0.05]">
                            {invoices.map((invoice) => (
                                <li key={invoice.id}>
                                    <button
                                        type="button"
                                        onClick={() => setDetailId(invoice.id)}
                                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-tint/[0.04]"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-x-2 text-sm">
                                                <span className="font-semibold tabular-nums text-foreground">
                                                    {invoice.reference}
                                                </span>
                                                <Badge
                                                    variant={invoice.channel === 'caisse_v2' ? 'outline' : 'accent'}
                                                    className="px-1.5 py-0 text-[10px]"
                                                >
                                                    {invoice.channel === 'caisse_v2' ? 'V2' : 'V1'}
                                                </Badge>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {invoice.opened_time}
                                                </span>
                                                <span className="truncate text-foreground">
                                                    {invoice.client_name ?? t('Client de passage')}
                                                </span>
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {(invoice.items ?? []).map((item) => item.label).join(' + ') || '—'}
                                                {(invoice.employees ?? []).length > 0 &&
                                                    ` · ${(invoice.employees ?? []).map((employee) => employee.name).join(', ')}`}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <div className="text-right">
                                                <p className={cn(
                                                    'text-sm font-semibold tabular-nums text-foreground',
                                                    (invoice.status === 'refunded' || invoice.sale_deleted) && 'line-through opacity-60',
                                                )}>
                                                    {formatCurrency(invoice.total_collected ?? invoice.total)}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {t(paymentMethodLabel(invoice.payment_method))}
                                                    {(() => {
                                                        if (invoice.sale_deleted) {
                                                            return '';
                                                        }
                                                        const commission = (invoice.commissions ?? []).length > 0
                                                            ? (invoice.commissions ?? [])
                                                                .filter((row) => row.status === 'validated')
                                                                .reduce((sum, row) => sum + row.amount, 0)
                                                            : (invoice.items ?? []).reduce(
                                                                (sum, item) => sum + (item.commission_amount ?? 0),
                                                                0,
                                                            );
                                                        return invoice.status === 'paid' && commission > 0
                                                            ? ` · comm. ${formatCurrency(commission)}`
                                                            : '';
                                                    })()}
                                                </p>
                                            </div>
                                            <Badge
                                                variant={invoice.sale_deleted
                                                    ? 'destructive'
                                                    : STATUS_META[invoice.status as Pos2InvoiceStatus]?.variant ?? 'outline'}
                                            >
                                                {invoice.sale_deleted
                                                    ? 'Supprimée'
                                                    : STATUS_META[invoice.status as Pos2InvoiceStatus]?.label ?? invoice.status}
                                            </Badge>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {/* Pagination + résumé */}
            {meta && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <p>
                        {t('{n} facture(s) — page {a}/{b}', { n: meta.total, a: meta.current_page, b: meta.last_page })} ·{' '}
                        {t('{c} payée(s) sur cette page ({x})', {
                            c: meta.page_paid_count,
                            x: formatCurrency(meta.page_paid_total),
                        })}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={meta.current_page <= 1}
                            onClick={() => setPage((value) => Math.max(1, value - 1))}
                        >
                            <ChevronLeft />
                            {t('Précédent')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={meta.current_page >= meta.last_page}
                            onClick={() => setPage((value) => value + 1)}
                        >
                            {t('Suivant')}
                            <ChevronRight />
                        </Button>
                    </div>
                </div>
            )}

            <Pos2InvoiceDetailDrawer invoiceId={detailId} onClose={() => setDetailId(null)} />
        </motion.div>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
}) {
    const { t } = useI18n();

    return (
        <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-10">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {t(option.label)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5 text-accent" />
                <span>{label}</span>
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
        </div>
    );
}
