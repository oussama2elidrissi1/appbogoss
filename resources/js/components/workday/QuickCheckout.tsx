import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, Package, Refrigerator, Search } from 'lucide-react';
import { createTransaction, getErrorMessage, getProducts, getServices } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { printSaleReceipt } from '@/lib/receipt';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency } from '@/lib/utils';
import type { CreateTransactionPayload, Employee, Product, Sale, Service } from '@/types/workday';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORIES, type CategoryConfig } from './categories';
import { ClientPicker, EMPTY_CLIENT_SELECTION, type ClientSelection } from './ClientPicker';
import { EmployeeAvatar } from './EmployeeAvatar';

interface QuickCheckoutProps {
    workDayId: number;
    employees: Employee[];
    employeesPending: boolean;
    /** Employees marked present at opening — surfaced first in the picker. */
    presentIds: number[];
    onSaleRecorded: () => void;
}

/** Numbered step wrapper — keeps the vertical rhythm identical across all six steps. */
function Step({
    index,
    title,
    hint,
    children,
}: {
    index: number;
    title: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="relative pl-9">
            <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-tint/[0.05] text-[11px] font-semibold text-muted-foreground ring-1 ring-tint/[0.07]">
                {index}
            </span>
            <div className="flex items-baseline justify-between gap-3">
                <Label className="text-foreground">{title}</Label>
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </div>
            <div className="mt-2.5">{children}</div>
        </section>
    );
}

export function QuickCheckout({
    workDayId,
    employees,
    employeesPending,
    presentIds,
    onSaleRecorded,
}: QuickCheckoutProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();

    const [employeeId, setEmployeeId] = useState<number | null>(null);
    const [client, setClient] = useState<ClientSelection>(EMPTY_CLIENT_SELECTION);
    const [category, setCategory] = useState<CategoryConfig | null>(null);
    const [serviceId, setServiceId] = useState<number | null>(null);
    const [serviceSearch, setServiceSearch] = useState('');
    const [label, setLabel] = useState('');
    const [price, setPrice] = useState('');
    const [commission, setCommission] = useState('');
    /** Once the operator edits the commission by hand we stop auto-suggesting. */
    const [commissionTouched, setCommissionTouched] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    // Present employees first, then the rest of the active roster.
    const orderedEmployees = useMemo(() => {
        const present = new Set(presentIds);
        return employees
            .filter((employee) => employee.is_active || present.has(employee.id))
            .sort((a, b) => Number(present.has(b.id)) - Number(present.has(a.id)));
    }, [employees, presentIds]);

    const selectedEmployee = useMemo(
        () => employees.find((employee) => employee.id === employeeId) ?? null,
        [employees, employeeId],
    );

    const usesProductCatalog = category?.value === 'vitrine' || category?.value === 'boisson';
    const productStockArea = category?.value === 'boisson' ? 'refrigerateur' : 'vitrine';
    const usesCatalog = category?.usesServiceCatalog ?? false;

    const {
        data: services,
        error: servicesLoadError,
        isError: servicesIsError,
        isPending: servicesPending,
    } = useQuery({
        queryKey: workDayKeys.services(category?.value ?? ''),
        queryFn: () => getServices(category?.value),
        enabled: usesCatalog && !usesProductCatalog && category !== null,
        staleTime: 5 * 60_000,
    });

    const {
        data: products,
        error: productsLoadError,
        isError: productsIsError,
        isPending: productsPending,
    } = useQuery({
        queryKey: workDayKeys.products('', productStockArea),
        queryFn: () => getProducts({ stockArea: productStockArea }),
        enabled: usesProductCatalog,
        staleTime: 5 * 60_000,
    });

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const list = usesProductCatalog ? (products ?? []) : (services ?? []);
        if (!term) return list;
        return list.filter((entry) => entry.name.toLowerCase().includes(term));
    }, [products, services, serviceSearch, usesProductCatalog]);
    const catalogPending =
        usesCatalog &&
        (usesProductCatalog
            ? productsPending && products === undefined
            : servicesPending && services === undefined);
    const catalogIsError = usesProductCatalog ? productsIsError : servicesIsError;
    const catalogError = usesProductCatalog ? productsLoadError : servicesLoadError;

    const priceValue = Number.parseFloat(price.replace(',', '.'));
    const hasValidPrice = Number.isFinite(priceValue) && priceValue > 0;

    const commissionValue = commission.trim() === '' ? null : Number.parseFloat(commission.replace(',', '.'));

    // Suggest a commission from the employee's default rate until it is overridden.
    useEffect(() => {
        if (commissionTouched) return;
        const rate = selectedEmployee?.default_commission_rate;
        if (!rate || !hasValidPrice) {
            setCommission('');
            return;
        }
        setCommission(String(Math.round((priceValue * rate) / 100)));
    }, [selectedEmployee, priceValue, hasValidPrice, commissionTouched]);

    function pickCategory(next: CategoryConfig) {
        setCategory(next);
        if (next.value === 'vitrine' || next.value === 'boisson') {
            setEmployeeId(null);
        }
        setServiceId(null);
        setServiceSearch('');
        setLabel('');
        setPrice('');
        setCommissionTouched(false);
    }

    function pickService(entry: Service | Product) {
        setServiceId(entry.id);
        setLabel(entry.name);
        setPrice(String(entry.price));
        setCommissionTouched(false);
    }

    const canSubmit =
        (usesProductCatalog || employeeId !== null) &&
        category !== null &&
        label.trim().length > 0 &&
        hasValidPrice &&
        (!usesProductCatalog || serviceId !== null);

    const mutation = useMutation({
        mutationFn: createTransaction,
        onSuccess: (sale: Sale) => {
            void printSaleReceipt(sale);

            // Optimistically prepend so the ledger reacts instantly, then reconcile.
            queryClient.setQueryData<Sale[]>(workDayKeys.transactions(workDayId), (current) =>
                current ? [sale, ...current] : [sale],
            );
            void queryClient.invalidateQueries({ queryKey: workDayKeys.transactions(workDayId) });
            void queryClient.invalidateQueries({ queryKey: ['products'] });
            onSaleRecorded();

            // Keep the employee selected — same person usually rings up several sales.
            setClient(EMPTY_CLIENT_SELECTION);
            setCategory(null);
            setServiceId(null);
            setServiceSearch('');
            setLabel('');
            setPrice('');
            setCommission('');
            setCommissionTouched(false);

            setJustSaved(true);
            window.setTimeout(() => setJustSaved(false), 1600);
        },
        onError: () => {
            // A 422 "Aucune journée ouverte." means the day was closed on another
            // device — resync rather than leaving the operator on a stale screen.
            void queryClient.invalidateQueries({ queryKey: workDayKeys.active });
        },
    });

    const submit = useCallback(() => {
        if (!canSubmit || category === null || mutation.isPending) return;

        const payload: CreateTransactionPayload = {
            employee_id: usesProductCatalog ? null : employeeId,
            category: category.value,
            label: label.trim(),
            price: priceValue,
            product_id: usesProductCatalog ? serviceId : null,
            service_id: usesProductCatalog ? null : serviceId,
            // Left untouched (still just the client-side estimate shown as a
            // suggestion) → omitted, so the server computes the real amount
            // via the employee's actual commission rules instead of this
            // rough flat-rate preview. Only an explicit edit overrides it.
            commission_amount:
                commissionTouched && commissionValue !== null && Number.isFinite(commissionValue)
                    ? commissionValue
                    : null,
        };

        if (client.mode === 'client' && client.client) {
            payload.client_id = client.client.id;
        } else if (client.mode === 'walkin' && client.label.trim()) {
            payload.client_label = client.label.trim();
        }

        mutation.mutate(payload);
    }, [
        canSubmit,
        employeeId,
        category,
        label,
        priceValue,
        commissionValue,
        commissionTouched,
        client,
        mutation,
        serviceId,
        usesProductCatalog,
    ]);

    /**
     * Shortcuts: 1–6 pick a category, Enter submits. Both are suppressed while a
     * text field has focus so normal typing is never hijacked.
     */
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            const typing =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target?.isContentEditable === true;

            if (event.key === 'Enter' && !event.shiftKey) {
                if (typing && target instanceof HTMLTextAreaElement) return;
                if (canSubmit) {
                    event.preventDefault();
                    submit();
                }
                return;
            }

            if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

            const index = Number.parseInt(event.key, 10) - 1;
            if (index >= 0 && index < CATEGORIES.length) {
                event.preventDefault();
                pickCategory(CATEGORIES[index]);
            }
        }

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [canSubmit, submit]);

    return (
        <Card className="relative">
            {/* Success pulse — a full-card wash rather than a toast dependency.
                No `overflow-hidden` on the Card itself: the client picker's
                dropdown (search results, "create new client" form) is
                absolutely positioned and needs to be able to extend past the
                card's bottom edge instead of being clipped. */}
            <AnimatePresence>
                {justSaved && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-background/70 backdrop-blur-[2px]"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                            className="flex flex-col items-center"
                        >
                            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success/[0.16]">
                                <Check className="h-7 w-7 text-success" />
                                <motion.span
                                    aria-hidden
                                    className="absolute inset-0 rounded-full ring-1 ring-success/40"
                                    animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
                                />
                            </span>
                            <p className="mt-3 text-sm font-medium text-foreground">
                                {t('Encaissement enregistré')}
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-7 p-6">
                <div>
                    <h3 className="text-base font-semibold leading-none tracking-tight">
                        {t('Nouvel encaissement')}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('Six étapes, quelques secondes. Touches 1–6 pour la catégorie, Entrée pour valider.')}
                    </p>
                </div>

                <Step index={1} title={t('Employé')}>
                    {usesProductCatalog ? (
                        <div className="flex items-center gap-3 rounded-md border border-accent/30 bg-accent/[0.08] px-3.5 py-3">
                            {productStockArea === 'refrigerateur' ? (
                                <Refrigerator className="h-5 w-5 text-accent" />
                            ) : (
                                <Package className="h-5 w-5 text-accent" />
                            )}
                            <div>
                                <p className="text-sm font-semibold text-foreground">{t('Vente directe du stock société')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('Aucun employé à sélectionner. Le ticket sera rattaché au stock {zone}.', {
                                        zone: t(productStockArea === 'refrigerateur' ? 'réfrigérateur' : 'vitrine'),
                                    })}
                                </p>
                            </div>
                        </div>
                    ) : employeesPending ? (
                        <div className="flex flex-wrap gap-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-11 w-32 rounded-md" />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {orderedEmployees.map((employee) => (
                                <Chip
                                    key={employee.id}
                                    selected={employeeId === employee.id}
                                    onClick={() => {
                                        setEmployeeId(employee.id);
                                        setCommissionTouched(false);
                                    }}
                                    className="pl-1.5"
                                >
                                    <EmployeeAvatar
                                        name={employee.name}
                                        color={employee.avatar_color}
                                        size="sm"
                                    />
                                    {employee.name}
                                </Chip>
                            ))}
                        </div>
                    )}
                </Step>

                <Step index={2} title={t('Client')} hint={t('Optionnel')}>
                    <ClientPicker value={client} onChange={setClient} />
                </Step>

                <Step index={3} title={t('Catégorie')} hint={t('Touches 1 à 6')}>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {CATEGORIES.map((config, index) => {
                            const Icon = config.icon;
                            const selected = category?.value === config.value;
                            return (
                                <Chip
                                    key={config.value}
                                    size="lg"
                                    selected={selected}
                                    onClick={() => pickCategory(config)}
                                >
                                    <Icon
                                        className={cn(
                                            selected ? config.chip : 'text-muted-foreground',
                                        )}
                                    />
                                    <span className="text-xs">{t(config.label)}</span>
                                    <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-muted-foreground/50">
                                        {index + 1}
                                    </span>
                                </Chip>
                            );
                        })}
                    </div>
                </Step>

                <Step
                    index={4}
                    title={t('Prestation')}
                    hint={category ? undefined : t('Choisissez une catégorie')}
                >
                    {!category ? (
                        <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-6 text-center text-xs text-muted-foreground">
                            {t('Sélectionnez d’abord une catégorie.')}
                        </div>
                    ) : usesCatalog ? (
                        <div className="space-y-2.5">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    value={serviceSearch}
                                    onChange={(event) => setServiceSearch(event.target.value)}
                                    placeholder={
                                        usesProductCatalog
                                            ? t('Rechercher un produit...')
                                            : t('Rechercher une prestation {x}...', { x: t(category.label).toLowerCase() })
                                    }
                                    className="pl-10"
                                />
                            </div>

                            {catalogPending ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {Array.from({ length: 4 }).map((_, index) => (
                                        <Skeleton key={index} className="h-14 rounded-md" />
                                    ))}
                                </div>
                            ) : catalogIsError ? (
                                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{getErrorMessage(catalogError)}</span>
                                </div>
                            ) : filteredServices.length === 0 ? (
                                <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                    {t('Aucun élément au catalogue — saisissez le libellé et le prix manuellement ci-dessous.')}
                                </div>
                            ) : (
                                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                                    {filteredServices.map((service) => {
                                        const outOfStock = 'stock_quantity' in service && service.stock_quantity < 1;
                                        return <button
                                            key={service.id}
                                            type="button"
                                            onClick={() => pickService(service)}
                                            disabled={outOfStock}
                                            className={cn(
                                                'flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left',
                                                'transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
                                                serviceId === service.id
                                                    ? 'border-accent/60 bg-accent/[0.12]'
                                                    : 'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/30 hover:bg-tint/[0.06]',
                                            )}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {service.name}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {'duration_minutes' in service
                                                        ? t('{n} min', { n: service.duration_minutes })
                                                        : t('{n} en stock', { n: service.stock_quantity })}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                {formatCurrency(service.price, {
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>
                                        </button>;
                                    })}
                                </div>
                            )}

                            <Input
                                value={label}
                                onChange={(event) => {
                                    setLabel(event.target.value);
                                    setServiceId(null);
                                }}
                                readOnly={usesProductCatalog}
                                placeholder={
                                    usesProductCatalog
                                        ? t('Libellé du produit')
                                        : t('Libellé de la prestation')
                                }
                            />
                        </div>
                    ) : (
                        <Input
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            placeholder={
                                category.value === 'boisson'
                                    ? t('Ex. Thé à la menthe')
                                    : category.value === 'vitrine'
                                      ? t('Ex. Shampooing argan 250ml')
                                      : t('Libellé')
                            }
                        />
                    )}
                </Step>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Step index={5} title={t('Prix')}>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={price}
                            onChange={(event) => {
                                setPrice(event.target.value);
                                setServiceId(null);
                            }}
                            readOnly={usesProductCatalog}
                            placeholder="0,00"
                            className="text-lg font-semibold tabular-nums"
                        />
                    </Step>

                    <Step
                        index={6}
                        title={t('Commission')}
                        hint={
                            selectedEmployee?.default_commission_rate
                                ? t('{x}% suggéré', { x: selectedEmployee.default_commission_rate })
                                : t('Optionnel')
                        }
                    >
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={commission}
                            onChange={(event) => {
                                setCommission(event.target.value);
                                setCommissionTouched(true);
                            }}
                            placeholder="—"
                            className="tabular-nums"
                        />
                    </Step>
                </div>

                {mutation.isError && (
                    <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-sm text-destructive">{getErrorMessage(mutation.error)}</p>
                    </div>
                )}

                <Button
                    variant="accent"
                    size="lg"
                    className="w-full"
                    disabled={!canSubmit || mutation.isPending}
                    onClick={submit}
                >
                    {mutation.isPending && <Loader2 className="animate-spin" />}
                    {mutation.isPending
                        ? t('Enregistrement…')
                        : hasValidPrice
                          ? t('Enregistrer · {x}', { x: formatCurrency(priceValue, { maximumFractionDigits: 2 }) })
                          : t('Enregistrer')}
                </Button>
            </div>
        </Card>
    );
}
