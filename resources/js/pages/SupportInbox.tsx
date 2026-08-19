import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Handshake, Loader2, MessageCircle, Send } from 'lucide-react';
import {
    getAdminSupportConversation,
    getAdminSupportConversations,
    getErrorMessage,
    sendAdminSupportMessage,
    setSupportConversationStatus,
} from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import type { SupportConversationStatus } from '@/types/partner-portal';

const STATUS_META: Record<SupportConversationStatus, { label: string; variant: BadgeProps['variant'] }> = {
    nouveau: { label: 'Nouveau', variant: 'default' },
    en_cours: { label: 'En cours', variant: 'accent' },
    en_attente_partenaire: { label: 'En attente partenaire', variant: 'outline' },
    resolu: { label: 'Résolu', variant: 'success' },
    ferme: { label: 'Fermé', variant: 'outline' },
};

const STATUS_FILTERS: Array<{ value: SupportConversationStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Toutes' },
    { value: 'nouveau', label: 'Nouveau' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'en_attente_partenaire', label: 'En attente partenaire' },
    { value: 'resolu', label: 'Résolu' },
    { value: 'ferme', label: 'Fermé' },
];

/** §25 — every partner's support conversations, in one inbox. */
export default function SupportInbox() {
    const [activeId, setActiveId] = useState<number | null>(null);

    if (activeId !== null) {
        return <ThreadView id={activeId} onBack={() => setActiveId(null)} />;
    }

    return <InboxList onSelect={setActiveId} />;
}

function InboxList({ onSelect }: { onSelect: (id: number) => void }) {
    const [statusFilter, setStatusFilter] = useState<SupportConversationStatus | 'all'>('all');

    const { data: conversations, isPending, isError, error } = useQuery({
        queryKey: ['admin', 'support', 'conversations'],
        queryFn: getAdminSupportConversations,
        refetchInterval: 30_000,
    });

    const rows = useMemo(
        () => (conversations ?? []).filter((c) => statusFilter === 'all' || c.status === statusFilter),
        [conversations, statusFilter],
    );

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Conversations avec les partenaires.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value)}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            statusFilter === filter.value
                                ? 'border-accent/60 bg-accent/[0.14] text-foreground'
                                : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                        )}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {isPending ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-16 w-full rounded-md" />
                    ))}
                </div>
            ) : isError ? (
                <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                </Card>
            ) : rows.length === 0 ? (
                <EmptyState icon={MessageCircle} title="Aucune conversation" description="Rien à traiter pour le moment." />
            ) : (
                <Card className="overflow-hidden">
                    <ul className="divide-y divide-tint/[0.06]">
                        {rows.map((conversation) => {
                            const status = STATUS_META[conversation.status];
                            return (
                                <li key={conversation.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(conversation.id)}
                                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-tint/[0.03]"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                <Handshake className="h-3.5 w-3.5 shrink-0 text-accent" />
                                                <span className="truncate">{conversation.partner_name ?? '—'}</span>
                                                {conversation.unread && (
                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                                )}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {conversation.subject ?? 'Sans sujet'} —{' '}
                                                {conversation.last_message_preview ?? '—'}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            <Badge variant={status.variant} className="text-[10px]">
                                                {status.label}
                                            </Badge>
                                            {conversation.last_message_at && (
                                                <span className="text-[11px] text-muted-foreground">
                                                    {formatRelativeTime(conversation.last_message_at)}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            )}
        </motion.div>
    );
}

function ThreadView({ id, onBack }: { id: number; onBack: () => void }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState('');

    const { data: conversation, isPending } = useQuery({
        queryKey: ['admin', 'support', 'conversation', id],
        queryFn: () => getAdminSupportConversation(id),
        refetchInterval: 8_000,
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
    }

    const sendMutation = useMutation({
        mutationFn: () => sendAdminSupportMessage(id, draft.trim()),
        onSuccess: () => {
            setDraft('');
            invalidate();
        },
    });

    const statusMutation = useMutation({
        mutationFn: (status: SupportConversationStatus) => setSupportConversationStatus(id, status),
        onSuccess: invalidate,
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Retour">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                        <Handshake className="h-3 w-3" />
                        {conversation?.partner_name ?? '…'}
                    </p>
                    <h1 className="truncate text-lg font-semibold text-foreground">
                        {conversation?.subject ?? 'Conversation'}
                    </h1>
                </div>
                {conversation && (
                    <Select
                        value={conversation.status}
                        onValueChange={(value) => statusMutation.mutate(value as SupportConversationStatus)}
                    >
                        <SelectTrigger className="h-9 w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(STATUS_META).map(([value, meta]) => (
                                <SelectItem key={value} value={value}>
                                    {meta.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <Card className="flex h-[60vh] flex-col overflow-hidden">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {isPending ? (
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <Skeleton key={index} className="h-12 w-2/3 rounded-md" />
                            ))}
                        </div>
                    ) : !conversation || conversation.messages.length === 0 ? (
                        <EmptyState icon={MessageCircle} title="Aucun message" description="Répondez pour démarrer l'échange." />
                    ) : (
                        conversation.messages.map((message) => (
                            <div key={message.id} className={cn('flex', message.is_staff ? 'justify-end' : 'justify-start')}>
                                <div
                                    className={cn(
                                        'max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm',
                                        message.is_staff ? 'bg-accent/[0.16] text-foreground' : 'bg-tint/[0.06] text-foreground',
                                    )}
                                >
                                    <p className="whitespace-pre-line">{message.body}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {message.is_staff ? message.author ?? 'BOGOSLAND' : conversation.partner_name ?? 'Partenaire'} ·{' '}
                                        {message.created_at ? formatRelativeTime(message.created_at) : ''}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex items-center gap-2 border-t border-tint/[0.06] p-3">
                    <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Écrire un message..."
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && draft.trim() && !sendMutation.isPending) {
                                sendMutation.mutate();
                            }
                        }}
                    />
                    <Button
                        type="button"
                        variant="accent"
                        size="icon"
                        disabled={!draft.trim() || sendMutation.isPending}
                        onClick={() => sendMutation.mutate()}
                        aria-label="Envoyer"
                    >
                        {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </Card>

            {sendMutation.isError && <p className="text-xs text-destructive">{getErrorMessage(sendMutation.error)}</p>}
        </motion.div>
    );
}
