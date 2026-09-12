import type {
    Pos2BreakdownRow,
    Pos2CheckoutPayload,
    Pos2Invoice,
    Pos2InvoiceLine,
    Pos2PaymentMethod,
    Pos2Tip,
} from '@/types/pos2';
import type { Employee, Product, Service } from '@/types/workday';
import { UserFacingError } from '@/lib/userFacingError';

/**
 * MOTEUR DE LA CAISSE DE TEST — une caisse complète qui n'existe que dans
 * l'onglet du navigateur.
 *
 * La garantie « rien n'est écrit en base » ne repose pas sur une promesse :
 * ce module n'importe AUCUNE fonction réseau. Il n'y a pas de `fetch` ici,
 * pas d'appel à `@/lib/api` ni à `@/lib/pos2Api`, et rien à débrancher par
 * erreur. La seule persistance est `sessionStorage`, propre à l'onglet et
 * effacée à sa fermeture — un rechargement de page ne perd donc pas le test
 * en cours, et aucune autre session ne le voit.
 *
 * Les calculs reproduisent volontairement ceux du serveur (PosService::
 * computeTotals, PosService::validatePayment, WorkDayService::
 * buildDetailedReport) pour que les montants testés soient ceux de la vraie
 * caisse. Deux écarts assumés, signalés dans l'écran :
 *
 *  - les commissions utilisent le taux par défaut de l'employé ; la vraie
 *    caisse applique d'abord les règles par service (CommissionResolver) ;
 *  - le stock n'est pas décrémenté, puisqu'il vit en base.
 *
 * Les identifiants créés ici sont NÉGATIFS. Un ticket de test ne peut donc
 * jamais être confondu avec une facture réelle, ni dans l'interface, ni dans
 * une requête qui partirait par accident.
 */

const STORAGE_KEY = 'bogosland.caisse-test.v1';

export interface SandboxDay {
    date: string;
    opening_balance: number;
    opened_at: string;
    employee_ids: number[];
    /** Clôturée : l'écran bascule sur le rapport, plus rien n'est encaissable. */
    closed_at: string | null;
    /** Compté dans le tiroir à la clôture, pour tester l'écart de caisse. */
    counted_balance: number | null;
}

export interface SandboxExpense {
    id: number;
    label: string;
    category: string;
    amount: number;
}

export interface SandboxAdvance {
    id: number;
    employee_id: number;
    employee_name: string;
    amount: number;
    reason: string;
}

export interface SandboxState {
    day: SandboxDay | null;
    /** Factures en cours — brouillon, en cours, ou en attente. */
    invoices: Pos2Invoice[];
    /** Tickets encaissés de la journée de test. */
    paid: Pos2Invoice[];
    expenses: SandboxExpense[];
    advances: SandboxAdvance[];
    /** Compteur d'identifiants locaux. Les ids distribués sont son opposé. */
    sequence: number;
}

export interface SandboxReportRow {
    key: string;
    label: string;
    count: number;
    total: number;
}

export interface SandboxReport {
    opening_balance: number;
    revenue_total: number;
    expenses_total: number;
    advances_total: number;
    commissions_total: number;
    net_result: number;
    cash_expected: number;
    ticket_count: number;
    average_ticket: number;
    tips_total: number;
    revenue_by_category: SandboxReportRow[];
    revenue_by_employee: SandboxReportRow[];
    top_prestations: SandboxReportRow[];
    payment_methods: SandboxReportRow[];
    expenses_detail: SandboxExpense[];
    advances_detail: SandboxAdvance[];
}

/** Ce qu'un clic sur le catalogue veut ajouter à la facture en cours. */
export interface SandboxLineInput {
    service?: Service | null;
    product?: Product | null;
    label?: string;
    unit_price?: number;
    employee?: Employee | null;
}

export function emptyState(): SandboxState {
    return { day: null, invoices: [], paid: [], expenses: [], advances: [], sequence: 0 };
}

// ---------------------------------------------------------------- stockage

/**
 * `sessionStorage` peut lever (navigation privée, stockage bloqué) ou
 * contenir un état d'une version précédente. Dans les deux cas on repart
 * d'une caisse vide plutôt que de casser l'écran : ce sont des données de
 * test, elles ne valent pas un message d'erreur.
 */
export function loadState(): SandboxState {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const parsed = JSON.parse(raw) as Partial<SandboxState>;
        return {
            day: parsed.day ?? null,
            invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
            paid: Array.isArray(parsed.paid) ? parsed.paid : [],
            expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
            advances: Array.isArray(parsed.advances) ? parsed.advances : [],
            sequence: typeof parsed.sequence === 'number' ? parsed.sequence : 0,
        };
    } catch {
        return emptyState();
    }
}

export function saveState(state: SandboxState): void {
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Test non persisté : sans gravité, la caisse reste utilisable.
    }
}

export function clearState(): void {
    try {
        window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // idem
    }
}

// ------------------------------------------------------------------ outils

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function clockNow(): string {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function take(state: SandboxState): { sequence: number; id: number } {
    const sequence = state.sequence + 1;
    return { sequence, id: -sequence };
}

function lineTotalOf(line: Pos2InvoiceLine): number {
    return round2(line.quantity * line.unit_price);
}

function effectiveLineTotalOf(line: Pos2InvoiceLine): number {
    const discount = Math.min(line.discount_amount ?? 0, lineTotalOf(line));
    return round2(Math.max(0, lineTotalOf(line) - discount));
}

/**
 * Commission estimée d'une ligne. Le serveur cherche d'abord une règle par
 * service ; faute de pouvoir la lire sans requête, la caisse de test s'en
 * tient au taux par défaut de l'employé — l'écran le dit.
 */
function estimateCommission(employee: Employee | null | undefined, base: number): number | null {
    if (!employee) return null;
    if (employee.default_commission_rate === null || employee.default_commission_rate === undefined) return 0;
    return round2((base * employee.default_commission_rate) / 100);
}

// ------------------------------------------------------------------ totaux

/**
 * Reproduit `PosService::computeTotals()` : remises de ligne d'abord, puis
 * remise de facture répartie au prorata sur les lignes payantes, le reste
 * sur la dernière. Le total découle des lignes arrondies, jamais l'inverse —
 * c'est ce qui garantit total === Σ(quantité × prix unitaire).
 */
export function recomputeInvoice(invoice: Pos2Invoice): Pos2Invoice {
    const items = invoice.items ?? [];
    const invoiceDiscountAsked = round2(invoice.discount_amount ?? 0);

    let subtotal = 0;
    let lineDiscounts = 0;
    const bases = new Map<number, number>();

    items.forEach((line) => {
        subtotal += lineTotalOf(line);
        lineDiscounts += Math.min(line.discount_amount ?? 0, lineTotalOf(line));
        bases.set(line.id, line.is_free ? 0 : effectiveLineTotalOf(line));
    });

    subtotal = round2(subtotal);
    lineDiscounts = round2(lineDiscounts);

    const baseSum = round2([...bases.values()].reduce((sum, base) => sum + base, 0));
    const invoiceDiscount = Math.min(invoiceDiscountAsked, baseSum);

    const payingIds = items.filter((line) => (bases.get(line.id) ?? 0) > 0).map((line) => line.id);
    const shares = new Map<number, number>();
    let allocated = 0;

    payingIds.forEach((lineId, index) => {
        const base = bases.get(lineId) ?? 0;
        const raw =
            index === payingIds.length - 1
                ? round2(invoiceDiscount - allocated)
                : baseSum > 0
                  ? round2((invoiceDiscount * base) / baseSum)
                  : 0;
        const share = Math.min(raw, base);
        shares.set(lineId, share);
        allocated = round2(allocated + share);
    });

    let total = 0;
    const recomputed = items.map((line) => {
        const base = bases.get(line.id) ?? 0;
        const effective = Math.max(0, round2(base - (shares.get(line.id) ?? 0)));
        const quantity = Math.max(1, line.quantity);
        const unitPrice = round2(effective / quantity);
        const lineTotal = round2(unitPrice * quantity);
        total += lineTotal;

        return { ...line, effective_line_total: effectiveLineTotalOf(line), line_total: lineTotalOf(line) };
    });

    return {
        ...invoice,
        items: recomputed,
        items_count: recomputed.length,
        subtotal,
        line_discounts_total: lineDiscounts,
        total: round2(total),
        status: recomputed.length > 0 ? 'in_progress' : 'draft',
    };
}

function replaceInvoice(state: SandboxState, invoice: Pos2Invoice): SandboxState {
    return {
        ...state,
        invoices: state.invoices.map((item) => (item.id === invoice.id ? invoice : item)),
    };
}

// ------------------------------------------------------------- opérations

export function openDay(
    state: SandboxState,
    input: { opening_balance: number; employee_ids: number[] },
): SandboxState {
    return {
        ...emptyState(),
        sequence: state.sequence,
        day: {
            date: todayIso(),
            opening_balance: round2(input.opening_balance),
            opened_at: clockNow(),
            employee_ids: input.employee_ids,
            closed_at: null,
            counted_balance: null,
        },
    };
}

/**
 * Clôture la journée de test. Les factures encore ouvertes sont abandonnées,
 * comme la vraie clôture refuse de laisser des tickets en suspens : elles
 * n'ont jamais été encaissées, elles ne comptent donc dans aucun total.
 */
export function closeDay(state: SandboxState, countedBalance: number | null): SandboxState {
    if (!state.day) return state;

    return {
        ...state,
        invoices: [],
        day: { ...state.day, closed_at: clockNow(), counted_balance: countedBalance },
    };
}

export function openInvoice(
    state: SandboxState,
    init?: { client_id?: number | null; client_name?: string | null; is_walk_in?: boolean },
): { state: SandboxState; invoice: Pos2Invoice } {
    const { sequence, id } = take(state);

    const invoice: Pos2Invoice = {
        id,
        reference: `TEST-${String(sequence).padStart(3, '0')}`,
        status: 'draft',
        channel: 'caisse_v2',
        held: false,
        held_at: null,
        work_day_id: null,
        appointment_id: null,
        client_id: init?.client_id ?? null,
        client_name: init?.client_name ?? null,
        client_phone: null,
        client_avatar_color: null,
        is_walk_in: init?.is_walk_in ?? false,
        employee_id: null,
        subtotal: 0,
        line_discounts_total: 0,
        discount_amount: null,
        discount_reason: null,
        total: 0,
        total_collected: 0,
        payment_method: null,
        payment_breakdown: null,
        amount_received: null,
        change_given: null,
        notes: null,
        created_at: new Date().toISOString(),
        opened_time: clockNow(),
        confirmed_at: null,
        cancelled_at: null,
        cancel_reason: null,
        refunded_at: null,
        refund_reason: null,
        sale_id: null,
        print_count: 0,
        items_count: 0,
        items: [],
        tips: [],
        tips_total: 0,
    };

    return {
        state: { ...state, sequence, invoices: [...state.invoices, invoice] },
        invoice,
    };
}

export function addLine(
    state: SandboxState,
    invoiceId: number,
    input: SandboxLineInput,
): { state: SandboxState; invoice: Pos2Invoice | null } {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return { state, invoice: null };

    const { sequence, id } = take(state);
    const employee = input.employee ?? null;

    const unitPrice = input.service
        ? input.service.price
        : input.product
          ? input.product.price
          : round2(input.unit_price ?? 0);

    const category = input.service
        ? input.service.category
        : input.product
          ? input.product.stock_area === 'refrigerateur'
              ? 'boisson'
              : 'vitrine'
          : null;

    const line: Pos2InvoiceLine = {
        id,
        service_id: input.service?.id ?? null,
        service_name: input.service?.name ?? null,
        product_id: input.product?.id ?? null,
        category,
        requires_employee: input.service != null,
        label: input.service?.name ?? input.product?.name ?? input.label ?? 'Ligne libre',
        quantity: 1,
        unit_price: unitPrice,
        discount_amount: null,
        discount_reason: null,
        line_total: unitPrice,
        effective_line_total: unitPrice,
        employee_id: input.product ? null : (employee?.id ?? null),
        employee_name: input.product ? null : (employee?.name ?? null),
        employee_avatar_color: input.product ? null : (employee?.avatar_color ?? null),
        beneficiary_name: null,
        duration_minutes: input.service?.duration_minutes ?? null,
        notes: null,
        is_free: false,
        public_price: unitPrice,
        client_subscription_id: null,
        loyalty_reward_id: null,
        commission_amount: null,
        estimated_commission: input.product ? null : estimateCommission(employee, unitPrice),
    };

    const invoice = recomputeInvoice({ ...target, items: [...(target.items ?? []), line] });

    return { state: replaceInvoice({ ...state, sequence }, invoice), invoice };
}

export function updateLine(
    state: SandboxState,
    invoiceId: number,
    lineId: number,
    patch: Record<string, unknown>,
    employees: Employee[],
): { state: SandboxState; invoice: Pos2Invoice | null } {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return { state, invoice: null };

    const items = (target.items ?? []).map((line) => {
        if (line.id !== lineId) return line;

        const next: Pos2InvoiceLine = { ...line };

        if ('quantity' in patch) next.quantity = Math.max(1, Number(patch.quantity) || 1);
        if ('unit_price' in patch) next.unit_price = round2(Number(patch.unit_price) || 0);
        if ('discount_amount' in patch) {
            next.discount_amount = patch.discount_amount === null ? null : round2(Number(patch.discount_amount) || 0);
        }
        if ('discount_reason' in patch) next.discount_reason = (patch.discount_reason as string) || null;
        if ('notes' in patch) next.notes = (patch.notes as string) || null;
        if ('beneficiary_name' in patch) next.beneficiary_name = (patch.beneficiary_name as string) || null;
        if ('employee_id' in patch) {
            const employee = employees.find((item) => item.id === Number(patch.employee_id)) ?? null;
            next.employee_id = employee?.id ?? null;
            next.employee_name = employee?.name ?? null;
            next.employee_avatar_color = employee?.avatar_color ?? null;
        }

        next.line_total = lineTotalOf(next);
        next.effective_line_total = effectiveLineTotalOf(next);
        next.estimated_commission =
            next.product_id != null
                ? null
                : estimateCommission(
                      employees.find((item) => item.id === next.employee_id) ?? null,
                      next.effective_line_total,
                  );

        return next;
    });

    const invoice = recomputeInvoice({ ...target, items });

    return { state: replaceInvoice(state, invoice), invoice };
}

export function removeLine(
    state: SandboxState,
    invoiceId: number,
    lineId: number,
): { state: SandboxState; invoice: Pos2Invoice | null } {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return { state, invoice: null };

    const invoice = recomputeInvoice({
        ...target,
        items: (target.items ?? []).filter((line) => line.id !== lineId),
    });

    return { state: replaceInvoice(state, invoice), invoice };
}

export function updateInvoice(
    state: SandboxState,
    invoiceId: number,
    patch: Record<string, unknown>,
): { state: SandboxState; invoice: Pos2Invoice | null } {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return { state, invoice: null };

    const next: Pos2Invoice = { ...target };

    if ('client_id' in patch) next.client_id = (patch.client_id as number | null) ?? null;
    if ('client_name' in patch) next.client_name = (patch.client_name as string | null) ?? null;
    if ('is_walk_in' in patch) next.is_walk_in = Boolean(patch.is_walk_in);
    if ('client_phone' in patch) next.client_phone = (patch.client_phone as string | null) ?? null;
    if ('client_avatar_color' in patch) next.client_avatar_color = (patch.client_avatar_color as string | null) ?? null;
    if ('discount_amount' in patch) {
        next.discount_amount = patch.discount_amount === null ? null : round2(Number(patch.discount_amount) || 0);
    }
    if ('discount_reason' in patch) next.discount_reason = (patch.discount_reason as string) || null;
    if ('notes' in patch) next.notes = (patch.notes as string) || null;

    if (next.client_id !== null) next.is_walk_in = false;

    const invoice = recomputeInvoice(next);

    return { state: replaceInvoice(state, invoice), invoice };
}

export function toggleHold(state: SandboxState, invoiceId: number): SandboxState {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return state;

    return replaceInvoice(state, {
        ...target,
        held: !target.held,
        held_at: target.held ? null : new Date().toISOString(),
    });
}

export function cancelInvoice(state: SandboxState, invoiceId: number): SandboxState {
    return { ...state, invoices: state.invoices.filter((invoice) => invoice.id !== invoiceId) };
}

/**
 * Reproduit les contrôles de `PosService::checkout()` et
 * `validatePayment()` : facture non vide, employé obligatoire sur toute
 * ligne de service, répartition d'un paiement mixte égale au total, montant
 * reçu suffisant en espèces. Un test qui passe ici passerait en vrai.
 */
export function checkout(
    state: SandboxState,
    invoiceId: number,
    payload: Pos2CheckoutPayload,
    employees: Employee[],
): { state: SandboxState; invoice: Pos2Invoice } {
    const target = state.invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) throw new UserFacingError('Facture de test introuvable.');

    const items = target.items ?? [];
    if (items.length === 0) {
        throw new UserFacingError('Ajoutez au moins un service avant d’encaisser.');
    }

    const orphan = items.find((line) => line.requires_employee && line.employee_id === null);
    if (orphan) {
        throw new Error(`Chaque service doit avoir un employé responsable — « ${orphan.label} » n’en a pas.`);
    }

    const withDiscount = recomputeInvoice({
        ...target,
        discount_amount:
            payload.discount_amount !== undefined ? payload.discount_amount : target.discount_amount,
        discount_reason: payload.discount_reason ?? target.discount_reason,
    });

    const total = withDiscount.total;
    const tips: Pos2Tip[] = (payload.tips ?? []).map((tip, index) => ({
        id: -(index + 1),
        employee_id: tip.employee_id,
        employee_name: employees.find((employee) => employee.id === tip.employee_id)?.name ?? null,
        prestation_item_id: tip.prestation_item_id ?? null,
        amount: round2(tip.amount),
        payment_method: tip.payment_method ?? null,
    }));
    const tipsTotal = round2(tips.reduce((sum, tip) => sum + tip.amount, 0));
    const due = round2(total + tipsTotal);

    const method: Pos2PaymentMethod = payload.payment_method;
    let breakdown: Pos2BreakdownRow[] | null = null;

    if (method === 'mixte') {
        const rows = payload.payment_breakdown ?? [];
        if (rows.length < 2) {
            throw new UserFacingError('Un paiement mixte doit détailler au moins deux moyens de paiement.');
        }
        const sum = round2(rows.reduce((acc, row) => acc + round2(row.amount), 0));
        if (Math.abs(sum - due) > 0.05) {
            throw new UserFacingError('La répartition ne correspond pas au total à payer.');
        }
        breakdown = rows.map((row) => ({ method: row.method, amount: round2(row.amount) }));
    }

    let amountReceived: number | null = null;
    let changeGiven: number | null = null;

    if (method === 'especes' && payload.amount_received != null) {
        amountReceived = round2(payload.amount_received);
        if (amountReceived + 0.009 < due) {
            throw new UserFacingError('Le montant reçu est inférieur au total à payer.');
        }
        changeGiven = round2(amountReceived - due);
    }

    const paidItems = items.map((line) => ({
        ...line,
        commission_amount:
            line.product_id != null
                ? null
                : estimateCommission(
                      employees.find((employee) => employee.id === line.employee_id) ?? null,
                      line.effective_line_total,
                  ),
    }));

    const paid: Pos2Invoice = {
        ...withDiscount,
        items: paidItems,
        status: 'paid',
        held: false,
        payment_method: method,
        payment_breakdown: breakdown,
        amount_received: amountReceived,
        change_given: changeGiven,
        confirmed_at: new Date().toISOString(),
        tips,
        tips_total: tipsTotal,
        total_collected: due,
        sale_id: null,
    };

    return {
        state: {
            ...state,
            invoices: state.invoices.filter((invoice) => invoice.id !== invoiceId),
            paid: [paid, ...state.paid],
        },
        invoice: paid,
    };
}

export function addExpense(
    state: SandboxState,
    input: { label: string; category: string; amount: number },
): SandboxState {
    const { sequence, id } = take(state);

    return {
        ...state,
        sequence,
        expenses: [
            ...state.expenses,
            { id, label: input.label, category: input.category, amount: round2(input.amount) },
        ],
    };
}

export function addAdvance(
    state: SandboxState,
    input: { employee_id: number; employee_name: string; amount: number; reason: string },
): SandboxState {
    const { sequence, id } = take(state);

    return {
        ...state,
        sequence,
        advances: [
            ...state.advances,
            {
                id,
                employee_id: input.employee_id,
                employee_name: input.employee_name,
                amount: round2(input.amount),
                reason: input.reason,
            },
        ],
    };
}

// ------------------------------------------------------------------ rapport

function rank(rows: Map<string, SandboxReportRow>): SandboxReportRow[] {
    return [...rows.values()].sort((a, b) => b.total - a.total);
}

function bump(rows: Map<string, SandboxReportRow>, key: string, label: string, amount: number, count = 1): void {
    const row = rows.get(key) ?? { key, label, count: 0, total: 0 };
    row.count += count;
    row.total = round2(row.total + amount);
    rows.set(key, row);
}

/**
 * Reproduit `WorkDayService::buildDetailedReport()` sur les seules données de
 * test : même formule de résultat (recette − dépenses − avances) et même
 * attendu de tiroir (fond + recette − dépenses − avances).
 */
export function buildReport(state: SandboxState): SandboxReport {
    const openingBalance = state.day?.opening_balance ?? 0;

    const revenueTotal = round2(state.paid.reduce((sum, invoice) => sum + invoice.total, 0));
    const expensesTotal = round2(state.expenses.reduce((sum, expense) => sum + expense.amount, 0));
    const advancesTotal = round2(state.advances.reduce((sum, advance) => sum + advance.amount, 0));
    const tipsTotal = round2(state.paid.reduce((sum, invoice) => sum + (invoice.tips_total ?? 0), 0));

    const categories = new Map<string, SandboxReportRow>();
    const employeeRows = new Map<string, SandboxReportRow>();
    const prestations = new Map<string, SandboxReportRow>();
    const methods = new Map<string, SandboxReportRow>();
    let commissionsTotal = 0;

    state.paid.forEach((invoice) => {
        bump(methods, invoice.payment_method ?? 'especes', invoice.payment_method ?? 'especes', invoice.total);

        (invoice.items ?? []).forEach((line) => {
            const amount = line.effective_line_total;
            bump(categories, line.category ?? 'autre', line.category ?? 'autre', amount);
            bump(prestations, line.label, line.label, amount, line.quantity);
            commissionsTotal = round2(commissionsTotal + (line.commission_amount ?? 0));

            if (line.employee_id !== null) {
                bump(employeeRows, String(line.employee_id), line.employee_name ?? 'Employé', amount);
            }
        });
    });

    const netResult = round2(revenueTotal - expensesTotal - advancesTotal);

    return {
        opening_balance: openingBalance,
        revenue_total: revenueTotal,
        expenses_total: expensesTotal,
        advances_total: advancesTotal,
        commissions_total: commissionsTotal,
        net_result: netResult,
        cash_expected: round2(openingBalance + revenueTotal - expensesTotal - advancesTotal),
        ticket_count: state.paid.length,
        average_ticket: state.paid.length > 0 ? round2(revenueTotal / state.paid.length) : 0,
        tips_total: tipsTotal,
        revenue_by_category: rank(categories),
        revenue_by_employee: rank(employeeRows),
        top_prestations: rank(prestations).slice(0, 12),
        payment_methods: rank(methods),
        expenses_detail: state.expenses,
        advances_detail: state.advances,
    };
}
