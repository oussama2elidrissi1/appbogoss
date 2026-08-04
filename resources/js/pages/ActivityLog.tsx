import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, History } from 'lucide-react';
import { getActivityLogs, getErrorMessage } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

const ACTION_LABELS: Record<string, string> = {
    'auth.login': 'Connexion',
    'employee.created': 'Employé créé',
    'employee.updated': 'Employé modifié',
    'employee.password_reset': 'Mot de passe réinitialisé',
    'employee.activated': 'Employé activé',
    'employee.deactivated': 'Employé désactivé',
    'prestation.draft': 'Prestation créée',
    'prestation.in_progress': 'Prestation en cours',
    'prestation.services_done': 'Services terminés',
    'prestation.pending_payment': 'Envoyée en caisse',
    'prestation.paid': 'Paiement confirmé',
    'prestation.cancelled': 'Prestation annulée',
    'prestation.refunded': 'Prestation remboursée',
    'prestation.print': 'Ticket imprimé',
    'prestation.reprint': 'Ticket réimprimé (Duplicata)',
    'commission_rule.created': 'Règle de commission créée',
    'commission_rule.updated': 'Règle de commission modifiée',
    'commission_rule.deleted': 'Règle de commission supprimée',
    'caisse.opened': 'Journée ouverte',
    'caisse.closed': 'Journée clôturée',
};

function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
}

function firstOfMonth(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function ActivityLog() {
    const [from, setFrom] = useState(firstOfMonth());
    const [to, setTo] = useState(today());

    const { data: logs, isPending, isError, error } = useQuery({
        queryKey: ['activity-logs', from, to],
        queryFn: () => getActivityLogs({ from, to }),
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Journal d'activité</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Historique des actions sensibles : connexions, employés, prestations, commissions, caisse.
                </p>
            </div>

            <Card className="flex flex-wrap items-end gap-4 p-4">
                <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Du
                    <input
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                        className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                    />
                </label>
                <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Au
                    <input
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                        className="block h-10 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent/60"
                    />
                </label>
            </Card>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                </Card>
            ) : !logs || logs.length === 0 ? (
                <EmptyState
                    icon={History}
                    title="Aucune activité"
                    description="Ajustez la période pour élargir la recherche."
                />
            ) : (
                <Card className="divide-y divide-tint/[0.05] overflow-hidden">
                    {logs.map((log) => (
                        <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{actionLabel(log.action)}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {log.user_name}
                                    {log.subject_type && (
                                        <>
                                            {' '}
                                            · {log.subject_type} #{log.subject_id}
                                        </>
                                    )}
                                </p>
                            </div>
                            <p className="shrink-0 text-xs text-muted-foreground">
                                {formatDate(log.created_at)} {formatTime(log.created_at)}
                            </p>
                        </div>
                    ))}
                </Card>
            )}
        </motion.div>
    );
}
