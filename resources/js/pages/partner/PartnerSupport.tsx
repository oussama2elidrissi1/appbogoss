import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    HelpCircle,
    Loader2,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Send,
} from 'lucide-react';
import {
    createPartnerSupportConversation,
    getErrorMessage,
    getPartnerSupportConversation,
    getPartnerSupportConversations,
    getSettings,
    sendPartnerSupportMessage,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { pageFade } from '@/lib/motion';
import { useAuth } from '@/hooks/useAuth';
import type { SupportConversationStatus } from '@/types/partner-portal';

const FAQ = [
    {
        q: 'Comment savoir si ma réservation a été acceptée ?',
        a: 'Son statut passe de « En attente » à « Confirmée » dans Mes réservations dès que BOGOSLAND la valide.',
    },
    {
        q: 'Quand ma commission est-elle validée ?',
        a: 'Une fois votre client réellement reçu et son paiement encaissé au salon — visible dans Mes commissions.',
    },
    {
        q: 'Quand suis-je payé ?',
        a: 'BOGOSLAND règle vos commissions validées périodiquement ; elles passent alors au statut « Payée », avec la date de règlement.',
    },
    {
        q: 'Puis-je voir les clients des autres partenaires ?',
        a: 'Non — votre portefeuille clients est strictement privé, visible uniquement par vous et BOGOSLAND.',
    },
];

const SUBJECTS = ['Réservation', 'Commission', 'Paiement', 'Client', 'Problème technique', 'Autre'];

const STATUS_META: Record<SupportConversationStatus, { label: string; variant: BadgeProps['variant'] }> = {
    nouveau: { label: 'Nouveau', variant: 'default' },
    en_cours: { label: 'En cours', variant: 'accent' },
    en_attente_partenaire: { label: 'En attente de vous', variant: 'outline' },
    resolu: { label: 'Résolu', variant: 'success' },
    ferme: { label: 'Fermé', variant: 'outline' },
};

export default function PartnerSupport() {
    const { t } = useI18n();
    const { user } = useAuth();
    const [activeId, setActiveId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);

    if (activeId !== null) {
        return <ThreadView id={activeId} onBack={() => setActiveId(null)} />;
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('Support')}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Bonjour {name}, comment pouvons-nous vous aider ?', { name: user?.partner_name ?? '' })}
                </p>
            </div>

            {creating ? (
                <NewConversationCard
                    onCreated={(id) => {
                        setCreating(false);
                        setActiveId(id);
                    }}
                    onCancel={() => setCreating(false)}
                />
            ) : (
                <>
                    <Card className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">{t('Contacter BOGOSLAND')}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('Réservation, commission, paiement, client, problème technique…')}
                            </p>
                        </div>
                        <Button type="button" variant="accent" onClick={() => setCreating(true)}>
                            <MessageCircle className="h-4 w-4" />
                            {t('Ouvrir une conversation')}
                        </Button>
                    </Card>

                    <ConversationList onSelect={setActiveId} />

                    <Card className="p-5 sm:p-6">
                        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Contact')}</h2>
                        <ContactInfo />
                    </Card>

                    <Card className="p-5 sm:p-6">
                        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            <HelpCircle className="h-3.5 w-3.5" />
                            {t('Questions fréquentes')}
                        </h2>
                        <div className="mt-4 space-y-4">
                            {FAQ.map((item) => (
                                <div key={item.q}>
                                    <p className="text-sm font-medium text-foreground">{t(item.q)}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{t(item.a)}</p>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}
        </motion.div>
    );
}

function ContactInfo() {
    const { data: settings, isPending } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

    if (isPending) {
        return (
            <div className="mt-4 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-40" />
            </div>
        );
    }

    return (
        <div className="mt-4 space-y-3 text-sm">
            {settings?.salon_phone && (
                <a href={`tel:${settings.salon_phone}`} className="flex items-center gap-2.5 text-foreground hover:text-accent">
                    <Phone className="h-4 w-4 text-accent" />
                    {settings.salon_phone}
                </a>
            )}
            {settings?.salon_email && (
                <a href={`mailto:${settings.salon_email}`} className="flex items-center gap-2.5 text-foreground hover:text-accent">
                    <Mail className="h-4 w-4 text-accent" />
                    {settings.salon_email}
                </a>
            )}
            {settings?.salon_address && (
                <p className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-accent" />
                    {settings.salon_address}
                </p>
            )}
        </div>
    );
}

function ConversationList({ onSelect }: { onSelect: (id: number) => void }) {
    const { t } = useI18n();
    const { data: conversations, isPending } = useQuery({
        queryKey: ['partner-portal', 'support', 'conversations'],
        queryFn: getPartnerSupportConversations,
    });

    if (isPending) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (!conversations || conversations.length === 0) return null;

    return (
        <Card className="overflow-hidden">
            <ul className="divide-y divide-tint/[0.06]">
                {conversations.map((conversation) => {
                    const status = STATUS_META[conversation.status];
                    return (
                        <li key={conversation.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(conversation.id)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-tint/[0.03]"
                            >
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                                        {conversation.subject ?? t('Conversation')}
                                        {conversation.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {conversation.last_message_preview ?? '—'}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <Badge variant={status.variant} className="text-[10px]">
                                        {t(status.label)}
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
    );
}

function NewConversationCard({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [subject, setSubject] = useState(SUBJECTS[0]);
    const [body, setBody] = useState('');

    const mutation = useMutation({
        mutationFn: () => createPartnerSupportConversation({ subject, body: body.trim() }),
        onSuccess: (conversation) => {
            void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'support'] });
            onCreated(conversation.id);
        },
    });

    return (
        <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-foreground">{t('Nouvelle conversation')}</h2>

            <div className="space-y-1.5">
                <Label>{t('Sujet')}</Label>
                <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setSubject(option)}
                            className={cn(
                                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                subject === option
                                    ? 'border-accent/60 bg-accent/[0.14] text-foreground'
                                    : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                            )}
                        >
                            {t(option)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="support-message">{t('Message')}</Label>
                <textarea
                    id="support-message"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={t('Décrivez votre question...')}
                    rows={5}
                    className="flex w-full rounded-md border border-input bg-tint/[0.03] px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-all duration-200 focus-visible:border-accent/60 focus-visible:bg-tint/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10"
                />
            </div>

            {mutation.isError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {getErrorMessage(mutation.error)}
                </div>
            )}

            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
                    {t('Annuler')}
                </Button>
                <Button
                    type="button"
                    variant="accent"
                    className="flex-1"
                    disabled={!body.trim() || mutation.isPending}
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending && <Loader2 className="animate-spin" />}
                    <Send className="h-4 w-4" />
                    {t('Envoyer')}
                </Button>
            </div>
        </Card>
    );
}

function ThreadView({ id, onBack }: { id: number; onBack: () => void }) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState('');

    // Polling only runs while this component is mounted (thread open) —
    // the list view above uses a plain one-shot fetch, no interval.
    const { data: conversation, isPending } = useQuery({
        queryKey: ['partner-portal', 'support', 'conversation', id],
        queryFn: () => getPartnerSupportConversation(id),
        refetchInterval: 8_000,
    });

    const sendMutation = useMutation({
        mutationFn: () => sendPartnerSupportMessage(id, draft.trim()),
        onSuccess: () => {
            setDraft('');
            void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'support'] });
        },
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto flex max-w-2xl flex-col gap-4">
            <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label={t('Retour')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">BOGOSLAND Support</p>
                    <h1 className="truncate text-lg font-semibold text-foreground">
                        {conversation?.subject ?? t('Conversation')}
                    </h1>
                </div>
                {conversation && (
                    <Badge variant={STATUS_META[conversation.status].variant}>
                        {t(STATUS_META[conversation.status].label)}
                    </Badge>
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
                        <EmptyState icon={MessageCircle} title={t('Aucun message')} description={t('Écrivez le premier message.')} />
                    ) : (
                        conversation.messages.map((message) => (
                            <div key={message.id} className={cn('flex', message.is_staff ? 'justify-start' : 'justify-end')}>
                                <div
                                    className={cn(
                                        'max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm',
                                        message.is_staff
                                            ? 'bg-tint/[0.06] text-foreground'
                                            : 'bg-accent/[0.16] text-foreground',
                                    )}
                                >
                                    <p className="whitespace-pre-line">{message.body}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {message.is_staff ? message.author ?? 'BOGOSLAND' : t('Vous')} ·{' '}
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
                        placeholder={t('Écrire un message...')}
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
                        aria-label={t('Envoyer')}
                    >
                        {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </Card>

            {sendMutation.isError && (
                <p className="text-xs text-destructive">{getErrorMessage(sendMutation.error)}</p>
            )}
        </motion.div>
    );
}
