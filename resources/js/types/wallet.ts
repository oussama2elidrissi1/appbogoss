/**
 * Portefeuille.
 *
 * Le solde n'est jamais recalculé côté client : le serveur agrège son ledger et
 * renvoie des totaux déjà justes. Deux clients (web et mobile) qui
 * additionneraient chacun de leur côté finiraient par ne plus être d'accord.
 */

export type WalletType = 'admin' | 'super_admin';

export type WalletTransactionType =
    | 'CASH_REGISTER_RESULT'
    | 'TRANSFER_TO_SUPER_ADMIN'
    /** Le chemin inverse : le patron renvoie de l'argent à un admin. */
    | 'TRANSFER_TO_ADMIN'
    /** Apport du patron — le seul argent qui entre sans venir du salon. */
    | 'OWNER_DEPOSIT'
    /** Paiement réel à un employé (salaire, commission, avance, prime). */
    | 'EMPLOYEE_PAYMENT'
    | 'EXPENSE'
    | 'CASH_FUND'
    | 'CASH_FUND_RETURN'
    | 'ADJUSTMENT';

/**
 * Motif d'un paiement d'employé.
 *
 * `advance` est le seul qui crée en plus une obligation : l'argent est sorti,
 * mais l'employé le doit encore et la paie le nettera.
 */
export type EmployeePaymentKind = 'salary' | 'commission' | 'advance' | 'bonus' | 'other';

/** Le solde touché : le disponible, ou la poche « fond de caisse ». */
export type WalletBucket = 'available' | 'cash_fund';

export interface WalletReconciliation {
    wallet_id: number;
    balance: number;
    computed_balance: number;
    cash_fund_balance: number;
    computed_cash_fund_balance: number;
    /** Faux = les soldes ne correspondent plus aux mouvements : anomalie à signaler. */
    balanced: boolean;
}

export interface Wallet {
    id: number;
    user_id: number;
    user_name?: string | null;
    type: WalletType;
    is_active: boolean;

    balance: number;
    cash_fund_balance: number;
    /** Disponible + fond de caisse : tout ce que ce portefeuille détient. */
    total_held: number;

    cash_registers_total: number;
    transfers_sent_total: number;
    transfers_received_total: number;
    /** Argent injecté par le patron. Toujours 0 sur un portefeuille d'admin. */
    owner_deposits_total: number;
    sent_to_admins_total: number;
    received_from_super_admin_total: number;
    employee_payments_total: number;
    expenses_total: number;
    cash_fund_allocated_total: number;
    cash_fund_returned_total: number;
    adjustments_total: number;
    movements_count: number;

    /** Date de démarrage du suivi. Rien d'antérieur n'alimente ce solde. */
    start_date: string;
    reconciliation: WalletReconciliation;
}

export interface WalletTransactionSource {
    type: string;
    id: number;
    label: string | null;
    date: string | null;
}

export interface WalletTransaction {
    id: number;
    wallet_id: number;
    counterparty_wallet_id: number | null;
    counterparty_name?: string | null;
    transfer_group: string | null;
    type: WalletTransactionType;
    type_label: string;
    direction: 'in' | 'out';
    bucket: WalletBucket;
    amount: number;
    /** Positif pour une entrée, négatif pour une sortie — donné par le serveur. */
    signed_amount: number;
    balance_after: number;
    cash_fund_after: number;
    category: string | null;
    reference: string | null;
    description: string | null;
    performed_by: string | null;
    performed_by_user_id: number | null;
    /** Renseignés uniquement sur un paiement d'employé. */
    employee_id: number | null;
    employee_name?: string | null;
    period: string | null;
    category_label: string | null;
    reverses_transaction_id: number | null;
    source: WalletTransactionSource | null;
    occurred_at: string;
    created_at: string;
}

export interface WalletOverviewRow {
    wallet_id: number;
    user_id: number;
    user_name: string;
    type: WalletType;
    is_active: boolean;
    balance: number;
    cash_fund_balance: number;
    total_held: number;
    cash_registers_total: number;
    transfers_sent_total: number;
    transfers_received_total: number;
    owner_deposits_total: number;
    sent_to_admins_total: number;
    received_from_super_admin_total: number;
    employee_payments_total: number;
    expenses_total: number;
    movements_count: number;
}

export interface WalletOverview {
    start_date: string;
    super_admin: {
        wallet_id: number | null;
        balance: number;
        cash_fund_balance: number;
        received_total: number;
        received_today: number;
        received_month: number;
        /** Ce que le patron a injecté lui-même — distinct de ce qu'il a reçu. */
        deposits_total: number;
        sent_to_admins_total: number;
    };
    admins: {
        count: number;
        balance_total: number;
        cash_fund_total: number;
        expenses_total: number;
        cash_registers_total: number;
        transfers_sent_total: number;
        received_from_super_admin_total: number;
        employee_payments_total: number;
    };
    expenses_total: number;
    employee_payments_total: number;
    cash_fund_total: number;
    wallets: WalletOverviewRow[];
}

export interface WalletTransactionFilters {
    from?: string;
    to?: string;
    type?: WalletTransactionType | '';
    direction?: 'in' | 'out' | '';
    min_amount?: number | '';
    max_amount?: number | '';
    work_day_id?: number | '';
    user_id?: number | '';
    limit?: number;
}

export interface WalletTransferPayload {
    amount: number;
    description?: string;
    reference?: string;
    /** Confirme un second envoi identique dans la minute. */
    allow_duplicate?: boolean;
}

export interface WalletExpensePayload {
    amount: number;
    label: string;
    category?: string;
    spent_on?: string;
    notes?: string;
    reference?: string;
}

export interface WalletCashFundPayload {
    amount: number;
    description?: string;
}

/** « Charger mon portefeuille » — Super Admin uniquement. Motif obligatoire. */
export interface WalletDepositPayload {
    amount: number;
    reason: string;
    reference?: string;
    notes?: string;
}

/** « Envoyer à un Admin » — le chemin inverse de la remise au patron. */
export interface WalletAdminTransferPayload {
    wallet_id: number;
    amount: number;
    description?: string;
    reference?: string;
    allow_duplicate?: boolean;
}

export interface EmployeePaymentPayload {
    employee_id: number;
    amount: number;
    kind: EmployeePaymentKind;
    /** Le mois que ce paiement solde — une étiquette, pas la date du mouvement. */
    period?: string;
    note?: string;
    reference?: string;
    /** Lève le refus de doublon (double appui, commission déjà sortie du tiroir). */
    acknowledge_duplicate?: boolean;
    /** Lève l'avertissement « ce montant dépasse le reste dû ». */
    acknowledge_over_due?: boolean;
}

/** D'où l'argent est réellement sorti. */
export type PaymentSourceKind = 'wallet' | 'caisse';

/**
 * Un versement à un employé, quelle qu'en soit la source.
 *
 * Le portefeuille et la caisse sont deux tiroirs différents : la ligne porte
 * donc toujours celui dont l'argent est sorti, parce que c'est la seule
 * question qui compte quand on relit un paiement.
 */
export interface EmployeePaymentRow {
    id: string;
    source: PaymentSourceKind;
    source_label: string;
    kind: string;
    kind_label: string;
    label: string | null;
    amount: number;
    occurred_at: string | null;
    period: string | null;
    reference: string | null;
    performed_by: string | null;
    wallet_owner: string | null;
    wallet_transaction_id: number | null;
    advance_id: number | null;
    work_day_id: number | null;
    work_day_date: string | null;
}

/**
 * Ce qu'il faut savoir avant de valider un paiement.
 *
 * `due_total` n'existe que pour une commission : l'application ne connaît pas
 * de salaire, et l'écran le dit plutôt que d'afficher une référence inventée.
 */
export interface EmployeePaymentContext {
    employee_id: number;
    employee_name: string;
    kind: string;
    kind_label: string;
    period: string | null;
    has_period: boolean;
    due_total: number | null;
    due_label: string | null;
    already_paid_total: number;
    already_paid_wallet: number;
    already_paid_caisse: number;
    remaining: number | null;
    advances_outstanding: number;
    payments: EmployeePaymentRow[];
}

/**
 * Ce qu'il reste à verser à un employé pour un mois.
 *
 * « Dû » est la commission gagnée — la seule obligation que l'application
 * connaisse. « Versé » est tout l'argent réellement remis pour ce mois, quelle
 * qu'en soit la poche : une avance compte, c'est de l'argent déjà dans la main
 * de l'employé.
 */
export interface EmployeeDueRow {
    employee_id: number;
    employee_name: string;
    avatar_color: string;
    is_active: boolean;
    due_total: number;
    /** Portefeuille + paies déjà enregistrées. */
    paid_total: number;
    /** Argent remis en main propre depuis un portefeuille. */
    paid_wallet: number;
    /** Paies du mois déjà enregistrées. */
    paid_payouts: number;
    /**
     * Avances non soldées : pas encore « payées », mais déjà dans la main de
     * l'employé, donc déduites du reste — exactement comme le fait la paie.
     */
    advances_outstanding: number;
    /** Part donnée pendant ce mois-ci. */
    advances_in_period: number;
    /**
     * Part venant de mois précédents, toujours non soldée. C'est elle qui
     * surprend : elle se déduit d'un mois où l'on n'a rien avancé.
     */
    advances_carried_over: number;
    /** Jamais négatif. Vient du même calcul que l'écran Paie. */
    remaining: number;
}

export interface EmployeeDues {
    period: string;
    totals: {
        employees_count: number;
        employees_remaining: number;
        due_total: number;
        paid_total: number;
        paid_wallet_total: number;
        paid_payouts_total: number;
        advances_outstanding_total: number;
        advances_in_period_total: number;
        advances_carried_over_total: number;
        remaining_total: number;
    };
    employees: EmployeeDueRow[];
}

/**
 * Ce qu'un employé a RÉELLEMENT reçu.
 *
 * À lire à côté de sa paie, jamais à la place : la paie dit ce qui est dû,
 * ceci dit ce qui est sorti.
 */
export interface EmployeePaymentHistory {
    employee_id: number;
    employee_name: string;
    /** Portefeuille + caisse : tout ce que l'employé a réellement touché. */
    total_paid: number;
    wallet_total: number;
    caisse_total: number;
    payments_count: number;
    last_payment_at: string | null;
    last_payment_amount: number | null;
    last_payment_source: PaymentSourceKind | null;
    by_kind: { kind: string; label: string; count: number; total: number }[];
    payments: EmployeePaymentRow[];
}

export interface WalletMutationResult {
    data: WalletTransaction;
    wallet: Wallet;
}

/**
 * Le statut « portefeuille » d'une journée de caisse, tel que l'affichent les
 * rapports par jour.
 *
 *  - `credited`     — le résultat a bien alimenté le portefeuille de l'admin ;
 *  - `reattributed` — crédit déplacé vers un autre portefeuille : l'argent y
 *                     reste compté comme résultat de caisse ;
 *  - `out_of_scope` — journée antérieure au démarrage : informative, jamais comptée ;
 *  - `pending`      — journée encore ouverte ;
 *  - `zero`         — résultat nul, aucun mouvement à écrire ;
 *  - `reversed`     — crédit contre-passé par un ajustement ;
 *  - `not_credited` — clôturée sans responsable identifiable (à signaler).
 */
export type WorkDayWalletStatus =
    | 'credited'
    | 'reattributed'
    | 'out_of_scope'
    | 'pending'
    | 'zero'
    | 'reversed'
    | 'not_credited';

export interface WorkDayWallet {
    status: WorkDayWalletStatus;
    start_date: string;
    amount: number | null;
    transaction_id: number | null;
    credited_at: string | null;
    wallet_id: number | null;
    wallet_owner: string | null;
}
