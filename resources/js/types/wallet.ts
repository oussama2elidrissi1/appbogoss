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
    | 'EXPENSE'
    | 'CASH_FUND'
    | 'CASH_FUND_RETURN'
    | 'ADJUSTMENT';

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
    };
    admins: {
        count: number;
        balance_total: number;
        cash_fund_total: number;
        expenses_total: number;
        cash_registers_total: number;
        transfers_sent_total: number;
    };
    expenses_total: number;
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

export interface WalletMutationResult {
    data: WalletTransaction;
    wallet: Wallet;
}

/**
 * Le statut « portefeuille » d'une journée de caisse, tel que l'affichent les
 * rapports par jour.
 *
 *  - `credited`     — le résultat a bien alimenté le portefeuille de l'admin ;
 *  - `out_of_scope` — journée antérieure au démarrage : informative, jamais comptée ;
 *  - `pending`      — journée encore ouverte ;
 *  - `zero`         — résultat nul, aucun mouvement à écrire ;
 *  - `reversed`     — crédit contre-passé par un ajustement ;
 *  - `not_credited` — clôturée sans responsable identifiable (à signaler).
 */
export type WorkDayWalletStatus =
    | 'credited'
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
