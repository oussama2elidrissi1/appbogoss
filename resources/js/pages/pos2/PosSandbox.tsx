import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    FlaskConical,
    HandCoins,
    Lock,
    Plus,
    ReceiptText,
    RotateCcw,
    ShoppingCart,
    Sunrise,
    Wallet,
    X,
} from 'lucide-react';
import { getEmployees, getServices, getSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { canPerform, eligibleEmployees } from '@/lib/pos2Eligibility';
import { paymentMethodLabel, printInvoiceA4, printInvoiceReceipt } from '@/lib/receiptV2';
import { pageFade } from '@/lib/motion';
import { UserFacingError } from '@/lib/userFacingError';
import { cn, formatCurrency } from '@/lib/utils';
import {
    addAdvance,
    addExpense,
    addLine,
    buildReport,
    cancelInvoice,
    checkout,
    clearState,
    closeDay,
    emptyState,
    loadState,
    openDay,
    openInvoice,
    removeLine,
    saveState,
    toggleHold,
    updateInvoice,
    updateLine,
    type SandboxLineInput,
    type SandboxState,
} from '@/lib/posSandbox';
import type { Client, Employee, Product, Service } from '@/types/workday';
import type { Pos2CheckoutPayload, Pos2Invoice } from '@/types/pos2';
import type { ClientSelection } from '@/components/workday/ClientPicker';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { Pos2Catalog } from '@/components/pos2/Pos2Catalog';
import { Pos2CheckoutDialog } from '@/components/pos2/Pos2CheckoutDialog';
import { Pos2InvoicePanel } from '@/components/pos2/Pos2InvoicePanel';
import { Pos2SuccessDialog } from '@/components/pos2/Pos2SuccessDialog';
import { SandboxDayReport } from '@/components/pos2/SandboxDayReport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * CAISSE DE TEST — la caisse complète, sans base de données.
 *
 * Écran réservé au Super Admin : ouvrir une journée, composer des factures
 * avec le vrai catalogue, encaisser, imprimer, clôturer et lire le rapport —
 * exactement le parcours de /pos, mais tout vit dans `sessionStorage` et
 * disparaît avec l'onglet. Rien n'arrive dans les rapports, la trésorerie,
 * les commissions, le stock ni la fidélité.
 *
 * Ce qui rend la garantie vérifiable : cet écran n'appelle AUCUNE écriture.
 * Les seules requêtes qu'il déclenche sont les lectures du catalogue
 * (employés, services, produits, réglages) et la recherche de clients — les
 * mêmes GET que n'importe quelle page de consultation.
 *
 * Les modules liés aux clients (abonnements, fidélité, QR, réservations,
 * prestations envoyées par les employés) sont volontairement absents : ils
 * consomment des droits, des points et des quotas réels, et aucun d'eux ne
 * peut être simulé sans toucher à des données vraies.
 */
export default function PosSandbox() {
    const { t } = useI18n();

    const [state, setState] = useState<SandboxState>(loadState);
    const [currentInvoiceId, setCurrentInvoiceId] = useState<number | null>(null);
    const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [paidInvoice, setPaidInvoice] = useState<Pos2Invoice | null>(null);
    const [ticketDetail, setTicketDetail] = useState<Pos2Invoice | null>(null);
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [cashDialog, setCashDialog] = useState<'expense' | 'advance' | null>(null);
    const [closeOpen, setCloseOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        saveState(state);
    }, [state]);

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

    const staff = useMemo(() => employees ?? [], [employees]);

    /**
     * L'équipe de la journée de test. C'est elle qui remplit les pastilles du
     * catalogue ET qui sert de vivier d'éligibilité : les deux doivent voir la
     * même liste, sinon un service se pré-assigne à quelqu'un d'absent.
     */
    const roster = useMemo(() => {
        const onDuty = staff.filter((employee) => state.day?.employee_ids.includes(employee.id));
        return onDuty.length > 0 ? onDuty : staff;
    }, [staff, state.day]);

    const currentInvoice = useMemo(
        () => state.invoices.find((invoice) => invoice.id === currentInvoiceId) ?? null,
        [state.invoices, currentInvoiceId],
    );

    const report = useMemo(() => buildReport(state), [state]);

    function resetAll() {
        clearState();
        setState(emptyState());
        setCurrentInvoiceId(null);
        setPaidInvoice(null);
        setTicketDetail(null);
        setActionError(null);
    }

    // ---------------------------------------------------------- composition

    /**
     * Les transitions partent de `state` et non d'un updater fonctionnel :
     * elles doivent aussi renvoyer l'identifiant de la facture touchée, et un
     * updater React peut être rejoué — il n'a pas le droit d'avoir d'effet.
     */
    function addToInvoice(input: SandboxLineInput) {
        setActionError(null);
        const base = currentInvoice ? { state, invoice: currentInvoice } : openInvoice(state);
        setState(addLine(base.state, base.invoice.id, input).state);
        setCurrentInvoiceId(base.invoice.id);
    }

    function startInvoice() {
        const opened = openInvoice(state);
        setState(opened.state);
        setCurrentInvoiceId(opened.invoice.id);
        setActionError(null);
    }

    function pickService(service: Service) {
        // Même règle que la vraie caisse : l'employé actif n'est pré-assigné
        // que s'il peut réaliser CE service ; sinon, s'il n'y a qu'un
        // employé éligible, c'est lui ; sinon la ligne attend un choix.
        const activeEmployee = roster.find((employee) => employee.id === activeEmployeeId) ?? null;
        const eligible = eligibleEmployees(roster, service);
        const employee =
            activeEmployee && canPerform(activeEmployee, service)
                ? activeEmployee
                : eligible.length === 1
                  ? eligible[0]
                  : null;

        addToInvoice({ service, employee });
    }

    function pickProduct(product: Product) {
        addToInvoice({ product });
    }

    function addFreeLine(label: string, price: number) {
        addToInvoice({
            label,
            unit_price: price,
            employee: roster.find((employee) => employee.id === activeEmployeeId) ?? null,
        });
    }

    function handleClientChange(selection: ClientSelection) {
        const patch = {
            client_id: selection.client?.id ?? null,
            client_name: selection.client?.name ?? selection.label ?? null,
            client_phone: selection.client?.phone ?? null,
            client_avatar_color: selection.client?.avatar_color ?? null,
            is_walk_in: selection.mode === 'walkin',
        };

        if (!currentInvoice) {
            if (!selection.client && !selection.label) return;
            const opened = openInvoice(state, patch);
            setState(opened.state);
            setCurrentInvoiceId(opened.invoice.id);
            return;
        }

        setState(updateInvoice(state, currentInvoice.id, patch).state);
    }

    async function submitCheckout(payload: Pos2CheckoutPayload): Promise<Pos2Invoice> {
        if (!currentInvoice) throw new UserFacingError(t('Aucune facture en cours.'));

        // `checkout()` rejoue les contrôles du serveur et lève comme lui ; le
        // dialogue d'encaissement affiche le message tel quel.
        const result = checkout(state, currentInvoice.id, payload, roster);
        setState(result.state);
        return result.invoice;
    }

    function printTicket(invoice: Pos2Invoice) {
        void printInvoiceReceipt(invoice, {
            salonName: `${settings?.salon_name ?? 'BOGOSLAND'} — ${t('TEST')}`,
            footer: settings?.receipt_footer,
        });
    }

    function printA4(invoice: Pos2Invoice) {
        void printInvoiceA4(invoice, {
            salon_name: `${settings?.salon_name ?? 'BOGOSLAND'} — ${t('TEST')}`,
            salon_phone: settings?.salon_phone,
            salon_email: settings?.salon_email,
            salon_address: settings?.salon_address,
            receipt_footer: settings?.receipt_footer,
            logo_url: settings?.logo_url,
        });
    }

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

    // ------------------------------------------------------------- écrans

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Caisse de test')}</h2>
                    <Badge variant="accent">
                        <FlaskConical />
                        {t('Aucune écriture en base')}
                    </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                        'Le parcours complet de la caisse, en mémoire : tout disparaît à la fermeture de l’onglet.',
                    )}
                </p>
            </div>
            <Button type="button" variant="outline" onClick={resetAll}>
                <RotateCcw />
                {t('Réinitialiser')}
            </Button>
        </div>
    );

    if (!state.day) {
        return (
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4">
                {header}
                <SandboxOpenDayCard
                    employees={staff}
                    onOpen={(input) => setState(openDay(state, input))}
                />
            </motion.div>
        );
    }

    if (state.day.closed_at !== null) {
        const variance =
            state.day.counted_balance !== null
                ? Math.round((state.day.counted_balance - report.cash_expected) * 100) / 100
                : null;

        return (
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4">
                {header}
                <Card>
                    <CardContent className="space-y-4 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display text-lg font-semibold">
                                    {t('Journée de test clôturée à {time}', { time: state.day.closed_at })}
                                </h3>
                                {variance !== null && (
                                    <Badge variant={variance === 0 ? 'success' : 'destructive'}>
                                        {variance === 0
                                            ? t('Tiroir juste')
                                            : t('Écart {amount}', { amount: formatCurrency(variance) })}
                                    </Badge>
                                )}
                            </div>
                            <Button type="button" variant="accent" onClick={resetAll}>
                                <Plus />
                                {t('Nouvelle journée de test')}
                            </Button>
                        </div>
                        <SandboxDayReport report={report} />
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    const panel = (
        <Pos2InvoicePanel
            invoice={currentInvoice}
            clientSelection={clientSelection}
            clientContext={undefined}
            employees={roster}
            canDiscount
            canCheckout
            canCancel
            busy={false}
            error={actionError}
            allowClientCreation={false}
            onClientChange={handleClientChange}
            onUpdateLine={(lineId, payload) =>
                currentInvoice && setState(updateLine(state, currentInvoice.id, lineId, payload, roster).state)
            }
            onRemoveLine={(lineId) =>
                currentInvoice && setState(removeLine(state, currentInvoice.id, lineId).state)
            }
            onHoldToggle={() => currentInvoice && setState(toggleHold(state, currentInvoice.id))}
            onCancel={() => {
                if (!currentInvoice) return;
                setState(cancelInvoice(state, currentInvoice.id));
                setCurrentInvoiceId(null);
            }}
            onOpenCheckout={() => setCheckoutOpen(true)}
            onNewInvoice={startInvoice}
            onUseSubscriptionService={() => undefined}
            onUseReward={() => undefined}
        />
    );

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4 pb-24 xl:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Caisse de test')}</h2>
                        <Badge variant="accent">
                            <FlaskConical />
                            {t('Aucune écriture en base')}
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('{count} en service · fond de caisse {amount} · ouverte à {time}', {
                            count: `${roster.length} ${t(roster.length > 1 ? 'employés' : 'employé')}`,
                            amount: formatCurrency(state.day.opening_balance),
                            time: state.day.opened_at,
                        })}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setCashDialog('expense')}>
                        <ReceiptText />
                        {t('Dépense')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setCashDialog('advance')}>
                        <HandCoins />
                        {t('Avance')}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetAll}>
                        <RotateCcw />
                        {t('Réinitialiser')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setCloseOpen(true)}>
                        <Lock />
                        {t('Clôturer la journée')}
                    </Button>
                    <Button type="button" variant="accent" onClick={startInvoice}>
                        <Plus />
                        {t('Nouvelle facture')}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <StatCard icon={Wallet} label={t('CA de test')} value={formatCurrency(report.revenue_total)} />
                <StatCard icon={ReceiptText} label={t('Tickets')} value={`${report.ticket_count}`} />
                <StatCard
                    icon={ShoppingCart}
                    label={t('Factures ouvertes')}
                    value={`${state.invoices.length}`}
                    hint={formatCurrency(state.invoices.reduce((sum, invoice) => sum + invoice.total, 0))}
                />
                <StatCard icon={HandCoins} label={t('Pourboires')} value={formatCurrency(report.tips_total)} />
            </div>

            {state.invoices.length > 0 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {state.invoices.map((invoice) => (
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
                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    {invoice.client_name ?? t('Client de passage')}
                                </p>
                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                    {invoice.reference} · {invoice.opened_time} · {formatCurrency(invoice.total)}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
                <Card>
                    <CardContent className="p-4">
                        <Pos2Catalog
                            services={services ?? []}
                            employees={roster}
                            activeEmployeeId={activeEmployeeId}
                            onActiveEmployeeChange={setActiveEmployeeId}
                            onPickService={pickService}
                            onPickProduct={pickProduct}
                            onAddFreeLine={addFreeLine}
                            busy={false}
                        />
                    </CardContent>
                </Card>

                <Card className="hidden max-h-[calc(100dvh-8rem)] overflow-hidden xl:sticky xl:top-20 xl:flex xl:flex-col">
                    {panel}
                </Card>
            </div>

            {state.paid.length > 0 && (
                <Card>
                    <CardContent className="space-y-2 p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {t('Tickets encaissés (test)')}
                        </h3>
                        {state.paid.map((invoice) => (
                            <button
                                key={invoice.id}
                                type="button"
                                onClick={() => setTicketDetail(invoice)}
                                className="flex w-full items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2 text-left hover:border-accent/30"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm">
                                        {invoice.reference} · {invoice.client_name ?? t('Client de passage')}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {invoice.opened_time} · {t(paymentMethodLabel(invoice.payment_method))} ·{' '}
                                        {(invoice.items ?? []).length}{' '}
                                        {t((invoice.items ?? []).length > 1 ? 'lignes' : 'ligne')}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                    {formatCurrency(invoice.total_collected ?? invoice.total)}
                                </span>
                            </button>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* -------------------------------------------- barre mobile */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tint/[0.08] bg-background/95 p-3 backdrop-blur xl:hidden">
                <Button
                    type="button"
                    variant="accent"
                    className="h-12 w-full justify-between text-base font-semibold"
                    onClick={() => setMobileCartOpen(true)}
                >
                    <span className="flex items-center gap-2">
                        <ShoppingCart />
                        {(currentInvoice?.items ?? []).length}{' '}
                        {t((currentInvoice?.items ?? []).length > 1 ? 'articles' : 'article')}
                    </span>
                    <span className="tabular-nums">{formatCurrency(currentInvoice?.total ?? 0)}</span>
                </Button>
            </div>

            {mobileCartOpen && (
                <div className="fixed inset-0 z-40 flex flex-col bg-scrim/70 backdrop-blur-sm xl:hidden">
                    <button
                        type="button"
                        aria-label={t('Fermer le panier')}
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
                            <span className="sr-only">{t('Fermer')}</span>
                        </button>
                        {panel}
                    </div>
                </div>
            )}

            {/* ----------------------------------------------- dialogues */}
            <Pos2CheckoutDialog
                open={checkoutOpen}
                invoice={currentInvoice}
                canDiscount
                onClose={() => setCheckoutOpen(false)}
                onSubmit={submitCheckout}
                onPaid={(invoice) => {
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
                    setTicketDetail(invoice);
                }}
                onNewSale={() => setPaidInvoice(null)}
                onClose={() => setPaidInvoice(null)}
            />
            <SandboxTicketDialog invoice={ticketDetail} onClose={() => setTicketDetail(null)} />
            <SandboxCashDialog
                mode={cashDialog}
                employees={roster}
                onClose={() => setCashDialog(null)}
                onExpense={(input) => setState(addExpense(state, input))}
                onAdvance={(input) => setState(addAdvance(state, input))}
            />
            <SandboxCloseDialog
                open={closeOpen}
                expected={report.cash_expected}
                openInvoices={state.invoices.length}
                onClose={() => setCloseOpen(false)}
                onConfirm={(counted) => {
                    setState(closeDay(state, counted));
                    setCloseOpen(false);
                    setCurrentInvoiceId(null);
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

/** Ouverture de la journée de test — le pendant local de OpenDayCard. */
function SandboxOpenDayCard({
    employees,
    onOpen,
}: {
    employees: Employee[];
    onOpen: (input: { opening_balance: number; employee_ids: number[] }) => void;
}) {
    const { t } = useI18n();
    const active = useMemo(() => employees.filter((employee) => employee.is_active), [employees]);
    const [balance, setBalance] = useState('0');
    const [selected, setSelected] = useState<number[] | null>(null);

    const chosen = selected ?? active.map((employee) => employee.id);

    return (
        <Card>
            <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <Sunrise className="h-5 w-5 text-accent" />
                    <h3 className="font-display text-lg font-semibold">{t('Ouvrir une journée de test')}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                    {t(
                        'Rien de ce qui suit ne quitte le navigateur : ni journée, ni ticket, ni commission, ni mouvement de stock.',
                    )}
                </p>

                <div className="max-w-xs space-y-1.5">
                    <Label htmlFor="sandbox-balance">{t('Fond de caisse')}</Label>
                    <Input
                        id="sandbox-balance"
                        type="number"
                        min={0}
                        step="0.01"
                        value={balance}
                        onChange={(event) => setBalance(event.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label>{t('Employés en service')}</Label>
                    <div className="flex flex-wrap gap-2">
                        {active.map((employee) => (
                            <Chip
                                key={employee.id}
                                size="sm"
                                selected={chosen.includes(employee.id)}
                                onClick={() =>
                                    setSelected(
                                        chosen.includes(employee.id)
                                            ? chosen.filter((id) => id !== employee.id)
                                            : [...chosen, employee.id],
                                    )
                                }
                            >
                                <EmployeeAvatar name={employee.name} color={employee.avatar_color} size="sm" />
                                {employee.name}
                            </Chip>
                        ))}
                    </div>
                </div>

                <Button
                    type="button"
                    variant="accent"
                    disabled={chosen.length === 0}
                    onClick={() =>
                        onOpen({ opening_balance: Number(balance) || 0, employee_ids: chosen })
                    }
                >
                    <Sunrise />
                    {t('Ouvrir la journée de test')}
                </Button>
            </CardContent>
        </Card>
    );
}

/** Dépense ou avance de test — les deux lignes qui font bouger le résultat. */
function SandboxCashDialog({
    mode,
    employees,
    onClose,
    onExpense,
    onAdvance,
}: {
    mode: 'expense' | 'advance' | null;
    employees: Employee[];
    onClose: () => void;
    onExpense: (input: { label: string; category: string; amount: number }) => void;
    onAdvance: (input: { employee_id: number; employee_name: string; amount: number; reason: string }) => void;
}) {
    const { t } = useI18n();
    const [label, setLabel] = useState('');
    const [amount, setAmount] = useState('');
    const [employeeId, setEmployeeId] = useState<number | null>(null);

    useEffect(() => {
        if (mode === null) return;
        setLabel('');
        setAmount('');
        setEmployeeId(employees[0]?.id ?? null);
    }, [mode, employees]);

    const value = Number(amount) || 0;
    const employee = employees.find((item) => item.id === employeeId) ?? null;
    const ready = value > 0 && (mode === 'expense' ? label.trim().length > 0 : employee !== null);

    return (
        <Dialog open={mode !== null} onOpenChange={(next) => !next && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'advance' ? t('Avance de test') : t('Dépense de test')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    {mode === 'advance' ? (
                        <div className="space-y-1.5">
                            <Label>{t('Employé')}</Label>
                            <div className="flex flex-wrap gap-2">
                                {employees.map((item) => (
                                    <Chip
                                        key={item.id}
                                        size="sm"
                                        selected={item.id === employeeId}
                                        onClick={() => setEmployeeId(item.id)}
                                    >
                                        {item.name}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label htmlFor="sandbox-expense-label">{t('Libellé')}</Label>
                            <Input
                                id="sandbox-expense-label"
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="sandbox-cash-amount">{t('Montant')}</Label>
                        <Input
                            id="sandbox-cash-amount"
                            type="number"
                            min={0}
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('Annuler')}
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            disabled={!ready}
                            onClick={() => {
                                if (mode === 'advance' && employee) {
                                    onAdvance({
                                        employee_id: employee.id,
                                        employee_name: employee.name,
                                        amount: value,
                                        reason: label.trim() || t('Avance de test'),
                                    });
                                } else if (mode === 'expense') {
                                    onExpense({ label: label.trim(), category: 'general', amount: value });
                                }
                                onClose();
                            }}
                        >
                            {t('Ajouter')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Clôture de la journée de test : compte le tiroir, puis montre le rapport. */
function SandboxCloseDialog({
    open,
    expected,
    openInvoices,
    onClose,
    onConfirm,
}: {
    open: boolean;
    expected: number;
    openInvoices: number;
    onClose: () => void;
    onConfirm: (counted: number | null) => void;
}) {
    const { t } = useI18n();
    const [counted, setCounted] = useState('');

    useEffect(() => {
        if (open) setCounted('');
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('Clôturer la journée de test')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {t('Attendu en tiroir : {amount}', { amount: formatCurrency(expected) })}
                    </p>

                    {openInvoices > 0 && (
                        <p className="rounded-md border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-xs text-destructive">
                            {t(
                                '{n} facture(s) encore ouverte(s) : elles seront abandonnées, elles n’ont jamais été encaissées.',
                                { n: openInvoices },
                            )}
                        </p>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="sandbox-counted">{t('Compté en tiroir (optionnel)')}</Label>
                        <Input
                            id="sandbox-counted"
                            type="number"
                            step="0.01"
                            value={counted}
                            onChange={(event) => setCounted(event.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('Annuler')}
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => onConfirm(counted === '' ? null : Number(counted) || 0)}
                        >
                            <Lock />
                            {t('Clôturer')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Détail d'un ticket de test — le drawer réel lirait la facture en base. */
function SandboxTicketDialog({ invoice, onClose }: { invoice: Pos2Invoice | null; onClose: () => void }) {
    const { t } = useI18n();

    return (
        <Dialog open={invoice !== null} onOpenChange={(next) => !next && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {invoice?.reference} · {invoice?.client_name ?? t('Client de passage')}
                    </DialogTitle>
                </DialogHeader>

                {invoice && (
                    <div className="space-y-2">
                        {(invoice.items ?? []).map((line) => (
                            <div
                                key={line.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm">{line.label}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {line.employee_name ?? t('Comptoir')} · {line.quantity} ×{' '}
                                        {formatCurrency(line.unit_price)}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                    {formatCurrency(line.effective_line_total)}
                                </span>
                            </div>
                        ))}

                        <div className="flex items-center justify-between border-t border-tint/[0.08] pt-2 text-sm font-semibold">
                            <span>{t('Total encaissé')}</span>
                            <span className="tabular-nums">
                                {formatCurrency(invoice.total_collected ?? invoice.total)}
                            </span>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
