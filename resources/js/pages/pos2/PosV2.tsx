import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    CalendarCheck,
    HandCoins,
    History,
    PauseCircle,
    Plus,
    ReceiptText,
    ScanLine,
    ShoppingCart,
    Sparkles,
    Wallet,
    X,
} from 'lucide-react';
import { getEmployees, getErrorMessage, getServices, getSettings } from '@/lib/api';
import {
    addPos2Line,
    cancelPos2Invoice,
    checkoutPos2Invoice,
    getPos2ClientContext,
    getPos2Dashboard,
    getPos2OpenInvoices,
    holdPos2Invoice,
    openPos2Invoice,
    pos2Keys,
    recordPos2Print,
    removePos2Line,
    resumePos2Invoice,
    updatePos2Invoice,
    updatePos2Line,
} from '@/lib/pos2Api';
import { canPerform, eligibleEmployees } from '@/lib/pos2Eligibility';
import { printInvoiceA4, printInvoiceReceipt } from '@/lib/receiptV2';
import { pageFade } from '@/lib/motion';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { Client, Product, Service } from '@/types/workday';
import type {
    Pos2CheckoutPayload,
    Pos2Invoice,
    Pos2LinePayload,
    Pos2QrLookupResult,
    Pos2SubscriptionInfo,
    Pos2SubscriptionServiceInfo,
} from '@/types/pos2';
import type { ClientSelection } from '@/components/workday/ClientPicker';
import { Pos2Catalog } from '@/components/pos2/Pos2Catalog';
import { Pos2CheckoutDialog } from '@/components/pos2/Pos2CheckoutDialog';
import { Pos2InvoiceDetailDrawer } from '@/components/pos2/Pos2InvoiceDetailDrawer';
import { Pos2InvoicePanel } from '@/components/pos2/Pos2InvoicePanel';
import { Pos2PendingPrestations } from '@/components/pos2/Pos2PendingPrestations';
import { Pos2QrScannerDialog } from '@/components/pos2/Pos2QrScannerDialog';
import { Pos2ReservationsDialog } from '@/components/pos2/Pos2ReservationsDialog';
import { Pos2SuccessDialog } from '@/components/pos2/Pos2SuccessDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * CAISSE V2 — BOGOSLAND POS. Lives at /pos-v2 alongside the untouched V1
 * caisse (/pos): left = catalog (employé actif, catégories, recherche,
 * services), right = the always-visible invoice panel. On mobile the panel
 * becomes a bottom sheet behind a sticky total bar (§46).
 */
export default function PosV2() {
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const canCheckout = hasPermission('caisse_v2.checkout');
    const canDiscount = hasPermission('caisse_v2.discount');
    const canCancel = hasPermission('caisse_v2.cancel');

    const [currentInvoiceId, setCurrentInvoiceId] = useState<number | null>(null);
    const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [paidInvoice, setPaidInvoice] = useState<Pos2Invoice | null>(null);
    const [detailId, setDetailId] = useState<number | null>(null);
    const [qrOpen, setQrOpen] = useState(false);
    const [reservationsOpen, setReservationsOpen] = useState(false);
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const { data: dashboard, isPending: dashboardPending } = useQuery({
        queryKey: pos2Keys.dashboard,
        queryFn: getPos2Dashboard,
        refetchInterval: 30_000,
    });

    const { data: openInvoices } = useQuery({
        queryKey: pos2Keys.invoices,
        queryFn: getPos2OpenInvoices,
        refetchInterval: 10_000,
    });

    const { data: employees } = useQuery({
        queryKey: ['employees'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
    });

    const { data: services } = useQuery({
        queryKey: ['services', 'pos2', 'all'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: getSettings,
        staleTime: 5 * 60_000,
    });

    const currentInvoice = useMemo(
        () => (openInvoices ?? []).find((invoice) => invoice.id === currentInvoiceId) ?? null,
        [openInvoices, currentInvoiceId],
    );

    const { data: clientContext } = useQuery({
        queryKey: pos2Keys.clientContext(currentInvoice?.client_id ?? 0),
        queryFn: () => getPos2ClientContext(currentInvoice?.client_id as number),
        enabled: currentInvoice?.client_id != null,
        staleTime: 30_000,
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: pos2Keys.all });
    }

    function onMutationError(error: unknown) {
        setActionError(getErrorMessage(error));
    }

    const openMutation = useMutation({
        mutationFn: openPos2Invoice,
        onSuccess: (invoice) => {
            setCurrentInvoiceId(invoice.id);
            setActionError(null);
            queryClient.setQueryData<Pos2Invoice[]>(pos2Keys.invoices, (list) => [...(list ?? []), invoice]);
            invalidate();
        },
        onError: onMutationError,
    });

    const addLineMutation = useMutation({
        mutationFn: ({ invoiceId, payload }: { invoiceId: number; payload: Pos2LinePayload }) =>
            addPos2Line(invoiceId, payload),
        onSuccess: (invoice) => {
            setActionError(null);
            queryClient.setQueryData<Pos2Invoice[]>(pos2Keys.invoices, (list) =>
                (list ?? []).map((item) => (item.id === invoice.id ? invoice : item)),
            );
            invalidate();
        },
        onError: onMutationError,
    });

    const updateLineMutation = useMutation({
        mutationFn: ({ invoiceId, lineId, payload }: { invoiceId: number; lineId: number; payload: Record<string, unknown> }) =>
            updatePos2Line(invoiceId, lineId, payload),
        onSuccess: (invoice) => {
            setActionError(null);
            queryClient.setQueryData<Pos2Invoice[]>(pos2Keys.invoices, (list) =>
                (list ?? []).map((item) => (item.id === invoice.id ? invoice : item)),
            );
        },
        onError: onMutationError,
    });

    const removeLineMutation = useMutation({
        mutationFn: ({ invoiceId, lineId }: { invoiceId: number; lineId: number }) =>
            removePos2Line(invoiceId, lineId),
        onSuccess: (invoice) => {
            setActionError(null);
            queryClient.setQueryData<Pos2Invoice[]>(pos2Keys.invoices, (list) =>
                (list ?? []).map((item) => (item.id === invoice.id ? invoice : item)),
            );
        },
        onError: onMutationError,
    });

    const updateInvoiceMutation = useMutation({
        mutationFn: ({ invoiceId, payload }: { invoiceId: number; payload: Record<string, unknown> }) =>
            updatePos2Invoice(invoiceId, payload),
        onSuccess: (invoice) => {
            setActionError(null);
            queryClient.setQueryData<Pos2Invoice[]>(pos2Keys.invoices, (list) =>
                (list ?? []).map((item) => (item.id === invoice.id ? invoice : item)),
            );
        },
        onError: onMutationError,
    });

    const holdMutation = useMutation({
        mutationFn: ({ invoiceId, resume }: { invoiceId: number; resume: boolean }) =>
            resume ? resumePos2Invoice(invoiceId) : holdPos2Invoice(invoiceId),
        onSuccess: () => {
            setActionError(null);
            invalidate();
        },
        onError: onMutationError,
    });

    const cancelMutation = useMutation({
        mutationFn: ({ invoiceId, reason }: { invoiceId: number; reason: string }) =>
            cancelPos2Invoice(invoiceId, reason || null),
        onSuccess: () => {
            setActionError(null);
            setCurrentInvoiceId(null);
            invalidate();
        },
        onError: onMutationError,
    });

    const busy =
        openMutation.isPending ||
        addLineMutation.isPending ||
        updateLineMutation.isPending ||
        removeLineMutation.isPending ||
        updateInvoiceMutation.isPending ||
        holdMutation.isPending ||
        cancelMutation.isPending;

    // ------------------------------------------------------------------
    // Workflow helpers — minimum de clics (§45)
    // ------------------------------------------------------------------

    function pickService(service: Service) {
        // §4 + §12 — l'employé actif n'est qu'un accélérateur : pré-assigné
        // seulement s'il est autorisé pour CE service ; sinon, si un seul
        // employé peut le réaliser, c'est lui (§11) ; sinon la ligne attend
        // un choix explicite (le backend refuse l'encaissement sans).
        const activeEmployee = (employees ?? []).find((employee) => employee.id === activeEmployeeId) ?? null;
        const eligible = eligibleEmployees(employees ?? [], service);
        const employeeId =
            activeEmployee && canPerform(activeEmployee, service)
                ? activeEmployee.id
                : eligible.length === 1
                  ? eligible[0].id
                  : null;

        const payload: Pos2LinePayload = {
            service_id: service.id,
            employee_id: employeeId,
        };
        if (currentInvoice) {
            addLineMutation.mutate({ invoiceId: currentInvoice.id, payload });
        } else {
            openMutation.mutate({ items: [payload] });
        }
    }

    function pickProduct(product: Product) {
        // Ligne produit : prix/label du produit, pas d'employé, stock
        // décrémenté à l'encaissement côté serveur.
        const payload: Pos2LinePayload = { product_id: product.id };
        if (currentInvoice) {
            addLineMutation.mutate({ invoiceId: currentInvoice.id, payload });
        } else {
            openMutation.mutate({ items: [payload] });
        }
    }

    function addFreeLine(label: string, price: number) {
        const payload: Pos2LinePayload = { label, unit_price: price, employee_id: activeEmployeeId };
        if (currentInvoice) {
            addLineMutation.mutate({ invoiceId: currentInvoice.id, payload });
        } else {
            openMutation.mutate({ items: [payload] });
        }
    }

    function handleClientChange(selection: ClientSelection) {
        const payload =
            selection.mode === 'client'
                ? { client_id: selection.client?.id ?? null, client_label: null }
                : { client_id: null, client_label: selection.label || null };

        if (currentInvoice) {
            updateInvoiceMutation.mutate({ invoiceId: currentInvoice.id, payload });
        } else if (selection.client || selection.label) {
            openMutation.mutate(payload);
        }
    }

    function useSubscriptionService(subscription: Pos2SubscriptionInfo, service: Pos2SubscriptionServiceInfo) {
        if (!currentInvoice || service.service_id === null) return;
        addLineMutation.mutate({
            invoiceId: currentInvoice.id,
            payload: {
                service_id: service.service_id,
                employee_id: activeEmployeeId,
                client_subscription_id: subscription.id,
                subscription_plan_service_id: service.subscription_plan_service_id,
            },
        });
    }

    function useReward(rewardId: number, serviceId: number | null) {
        if (!currentInvoice) return;
        addLineMutation.mutate({
            invoiceId: currentInvoice.id,
            payload: {
                loyalty_reward_id: rewardId,
                service_id: serviceId,
                employee_id: activeEmployeeId,
            },
        });
    }

    function handleQrResolved(result: Pos2QrLookupResult) {
        setQrOpen(false);
        if (result.client.id == null) return;
        const payload = { client_id: result.client.id, client_label: null };
        if (currentInvoice) {
            updateInvoiceMutation.mutate({ invoiceId: currentInvoice.id, payload });
        } else {
            openMutation.mutate(payload);
        }
    }

    async function submitCheckout(payload: Pos2CheckoutPayload): Promise<Pos2Invoice> {
        if (!currentInvoice) throw new Error('no invoice');
        const paid = await checkoutPos2Invoice(currentInvoice.id, payload);
        invalidate();
        return paid;
    }

    function printTicket(invoice: Pos2Invoice) {
        void recordPos2Print(invoice.id).catch(() => undefined);
        void printInvoiceReceipt(invoice, {
            salonName: settings?.salon_name ?? 'BOGOSLAND',
            footer: settings?.receipt_footer,
        });
    }

    function printA4(invoice: Pos2Invoice) {
        void recordPos2Print(invoice.id).catch(() => undefined);
        void printInvoiceA4(invoice, {
            salon_name: settings?.salon_name,
            salon_phone: settings?.salon_phone,
            salon_email: settings?.salon_email,
            salon_address: settings?.salon_address,
            receipt_footer: settings?.receipt_footer,
            logo_url: settings?.logo_url,
        });
    }

    // ------------------------------------------------------------------

    const clientSelection: ClientSelection = useMemo(() => {
        if (currentInvoice?.client_id != null) {
            return {
                mode: 'client',
                client: {
                    id: currentInvoice.client_id,
                    name: currentInvoice.client_name ?? 'Client',
                    phone: currentInvoice.client_phone,
                    avatar_color: currentInvoice.client_avatar_color ?? '#4C7CC8',
                } as Client,
                label: '',
            };
        }
        if (currentInvoice?.is_walk_in && currentInvoice.client_name) {
            return { mode: 'walkin', client: null, label: currentInvoice.client_name };
        }
        return { mode: 'client', client: null, label: '' };
    }, [currentInvoice]);

    const coveredServiceIds = useMemo(() => {
        const ids = new Set<number>();
        clientContext?.subscriptions.forEach((subscription) => {
            if (!subscription.usable) return;
            subscription.services.forEach((service) => {
                const exhausted =
                    (service.period_remaining !== null && service.period_remaining <= 0) ||
                    (service.total_remaining !== null && service.total_remaining <= 0);
                if (service.service_id !== null && !exhausted) ids.add(service.service_id);
            });
        });
        return ids;
    }, [clientContext]);

    const itemsCount = currentInvoice?.items?.length ?? 0;
    const noWorkDay = dashboard !== undefined && dashboard.work_day === null;

    const panel = (
        <Pos2InvoicePanel
            invoice={currentInvoice}
            clientSelection={clientSelection}
            clientContext={currentInvoice?.client_id != null ? clientContext : undefined}
            employees={employees ?? []}
            canDiscount={canDiscount}
            canCheckout={canCheckout}
            canCancel={canCancel}
            busy={busy}
            error={actionError}
            onClientChange={handleClientChange}
            onUpdateLine={(lineId, payload) =>
                currentInvoice && updateLineMutation.mutate({ invoiceId: currentInvoice.id, lineId, payload })
            }
            onRemoveLine={(lineId) =>
                currentInvoice && removeLineMutation.mutate({ invoiceId: currentInvoice.id, lineId })
            }
            onHoldToggle={() =>
                currentInvoice &&
                holdMutation.mutate({ invoiceId: currentInvoice.id, resume: currentInvoice.held })
            }
            onCancel={(reason) => currentInvoice && cancelMutation.mutate({ invoiceId: currentInvoice.id, reason })}
            onOpenCheckout={() => setCheckoutOpen(true)}
            onNewInvoice={() => openMutation.mutate({})}
            onUseSubscriptionService={useSubscriptionService}
            onUseReward={useReward}
        />
    );

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4 pb-24 xl:pb-0">
            {/* ---------------------------------------------------- header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight">
                        Caisse V2
                        <Badge variant="accent" className="translate-y-px">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Nouveau
                        </Badge>
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Factures ouvertes, employé par service, abonnements et pourboires.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setReservationsOpen(true)}>
                        <CalendarCheck />
                        Réservations
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setQrOpen(true)}>
                        <ScanLine />
                        Scanner QR
                    </Button>
                    <Button type="button" variant="outline" asChild>
                        <Link to="/pos-v2/historique">
                            <History />
                            Historique
                        </Link>
                    </Button>
                    <Button type="button" variant="accent" disabled={busy} onClick={() => openMutation.mutate({})}>
                        <Plus />
                        Nouvelle facture
                    </Button>
                </div>
            </div>

            {/* ---------------------------------------------------- stats (§33) */}
            {dashboardPending ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {[0, 1, 2, 3].map((index) => (
                        <Skeleton key={index} className="h-[72px] w-full" />
                    ))}
                </div>
            ) : dashboard ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <StatCard
                        icon={Wallet}
                        label="CA aujourd'hui"
                        value={formatCurrency(dashboard.revenue_total)}
                    />
                    <StatCard
                        icon={ReceiptText}
                        label="Tickets"
                        value={`${dashboard.ticket_count}`}
                        hint={`${dashboard.v2_ticket_count} via V2`}
                    />
                    <StatCard
                        icon={ShoppingCart}
                        label="Factures ouvertes"
                        value={`${dashboard.open_invoices_count}`}
                        hint={formatCurrency(dashboard.open_invoices_total)}
                    />
                    <StatCard
                        icon={HandCoins}
                        label="Pourboires"
                        value={formatCurrency(dashboard.tips_total)}
                        hint={
                            dashboard.subscription_payments_total > 0
                                ? `Abos ${formatCurrency(dashboard.subscription_payments_total)}`
                                : undefined
                        }
                    />
                </div>
            ) : null}

            {noWorkDay && (
                <Card className="border-destructive/25 bg-destructive/[0.05]">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <p className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            Aucune journée ouverte — la caisse utilise le même cycle d'ouverture/clôture que la
                            Caisse V1.
                        </p>
                        <Button type="button" variant="outline" size="sm" asChild>
                            <Link to="/pos">Ouvrir la journée</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* ---------------------- prestations envoyées par les employés (V1) */}
            <Pos2PendingPrestations
                currentInvoice={currentInvoice}
                onImported={(invoice) => setCurrentInvoiceId(invoice.id)}
            />

            {/* ----------------------------------------- factures ouvertes (§21) */}
            {(openInvoices ?? []).length > 0 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {(openInvoices ?? []).map((invoice) => (
                        <button
                            key={invoice.id}
                            type="button"
                            onClick={() => {
                                setCurrentInvoiceId(invoice.id);
                                setActionError(null);
                            }}
                            className={cn(
                                'flex shrink-0 items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-all duration-200',
                                invoice.id === currentInvoiceId
                                    ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                                    : 'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/30',
                            )}
                        >
                            {invoice.held && <PauseCircle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    {invoice.client_name ?? 'Client de passage'}
                                </p>
                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                    {invoice.opened_time} · {invoice.items_count ?? 0} service
                                    {(invoice.items_count ?? 0) > 1 ? 's' : ''} ·{' '}
                                    {formatCurrency(invoice.total)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* ---------------------------------------------------- main grid */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
                <Card>
                    <CardContent className="p-4">
                        <Pos2Catalog
                            services={services ?? []}
                            employees={employees ?? []}
                            activeEmployeeId={activeEmployeeId}
                            onActiveEmployeeChange={setActiveEmployeeId}
                            onPickService={pickService}
                            onPickProduct={pickProduct}
                            onAddFreeLine={addFreeLine}
                            coveredServiceIds={coveredServiceIds}
                            busy={busy}
                        />
                    </CardContent>
                </Card>

                {/* Desktop : panneau facture toujours visible (§44) */}
                <Card className="hidden max-h-[calc(100dvh-8rem)] overflow-hidden xl:sticky xl:top-20 xl:flex xl:flex-col">
                    {panel}
                </Card>
            </div>

            {/* -------------------------------------------- mobile bottom bar (§46) */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tint/[0.08] bg-background/95 p-3 backdrop-blur xl:hidden">
                <Button
                    type="button"
                    variant="accent"
                    className="h-12 w-full justify-between text-base font-semibold"
                    onClick={() => setMobileCartOpen(true)}
                >
                    <span className="flex items-center gap-2">
                        <ShoppingCart />
                        {itemsCount} article{itemsCount > 1 ? 's' : ''}
                    </span>
                    <span className="tabular-nums">{formatCurrency(currentInvoice?.total ?? 0)}</span>
                </Button>
            </div>

            {mobileCartOpen && (
                <div className="fixed inset-0 z-40 flex flex-col bg-scrim/70 backdrop-blur-sm xl:hidden">
                    <button
                        type="button"
                        aria-label="Fermer le panier"
                        className="flex-1"
                        onClick={() => setMobileCartOpen(false)}
                    />
                    <div className="relative flex max-h-[86dvh] flex-col rounded-t-xl border-t border-tint/[0.1] bg-background shadow-soft-lg">
                        <button
                            type="button"
                            onClick={() => setMobileCartOpen(false)}
                            className="absolute right-3 top-3 z-10 rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-5 w-5" />
                            <span className="sr-only">Fermer</span>
                        </button>
                        {panel}
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------- dialogs */}
            <Pos2CheckoutDialog
                open={checkoutOpen}
                invoice={currentInvoice}
                canDiscount={canDiscount}
                onClose={() => setCheckoutOpen(false)}
                onSubmit={submitCheckout}
                onPaid={(invoice) => {
                    // Le succès vit dans SON dialog, piloté par un état de
                    // page : aucun rafraîchissement de données ne peut le
                    // faire disparaître.
                    setCheckoutOpen(false);
                    setCurrentInvoiceId(null);
                    setMobileCartOpen(false);
                    setPaidInvoice(invoice);
                }}
            />
            <Pos2SuccessDialog
                invoice={paidInvoice}
                onPrintTicket={printTicket}
                onPrintA4={printA4}
                onViewDetail={(invoice) => {
                    setPaidInvoice(null);
                    setDetailId(invoice.id);
                }}
                onNewSale={() => setPaidInvoice(null)}
                onClose={() => setPaidInvoice(null)}
            />
            <Pos2InvoiceDetailDrawer invoiceId={detailId} onClose={() => setDetailId(null)} />
            <Pos2QrScannerDialog open={qrOpen} onClose={() => setQrOpen(false)} onResolved={handleQrResolved} />
            <Pos2ReservationsDialog
                open={reservationsOpen}
                onClose={() => setReservationsOpen(false)}
                onOpened={(invoice) => {
                    setReservationsOpen(false);
                    setCurrentInvoiceId(invoice.id);
                }}
            />
        </motion.div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    hint,
}: {
    icon: typeof Wallet;
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5 text-accent" />
                {label}
            </p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
            {hint && <p className="text-[11px] tabular-nums text-muted-foreground">{hint}</p>}
        </div>
    );
}
