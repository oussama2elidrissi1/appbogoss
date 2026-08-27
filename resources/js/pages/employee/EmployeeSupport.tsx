import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    createEmployeeSupportConversation,
    getEmployeeSupportConversation,
    getEmployeeSupportConversations,
    sendEmployeeSupportMessage,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

export default function EmployeeSupport() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState('');
    const [body, setBody] = useState('');
    const [reply, setReply] = useState('');

    const { data: conversations = [] } = useQuery({
        queryKey: ['employee-workspace', 'support'],
        queryFn: getEmployeeSupportConversations,
    });
    const { data: detail } = useQuery({
        queryKey: ['employee-workspace', 'support', selectedId],
        queryFn: () => getEmployeeSupportConversation(selectedId as number),
        enabled: selectedId !== null,
    });

    const createMutation = useMutation({
        mutationFn: createEmployeeSupportConversation,
        onSuccess: (created) => {
            setSelectedId(created.id);
            setSubject('');
            setCategory('');
            setBody('');
            void queryClient.invalidateQueries({ queryKey: ['employee-workspace', 'support'] });
        },
    });
    const replyMutation = useMutation({
        mutationFn: ({ id, message }: { id: number; message: string }) => sendEmployeeSupportMessage(id, message),
        onSuccess: () => {
            setReply('');
            void queryClient.invalidateQueries({ queryKey: ['employee-workspace', 'support'] });
        },
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Support')}</h2>
                <p className="text-sm text-white/50">{t("Ouvrez une conversation avec l'administration.")}</p>
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                <EmployeePanel>
                    <EmployeePanelTitle title={t('Nouvelle conversation')} icon={Headphones} />
                    <form
                        className="space-y-3 p-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createMutation.mutate({ subject, category: category || null, body });
                        }}
                    >
                        <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={t('Sujet')} className="border-white/[0.08] bg-white/[0.04] text-white" required />
                        <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder={t('Categorie')} className="border-white/[0.08] bg-white/[0.04] text-white" />
                        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('Message')} className="min-h-28 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white" required />
                        <Button type="submit" variant="accent" disabled={createMutation.isPending || !subject || !body}>
                            {createMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                            {t('Envoyer')}
                        </Button>
                    </form>
                    <div className="border-t border-white/[0.07] p-3">
                        {conversations.map((conversation) => (
                            <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className="mb-2 w-full rounded-md border border-white/[0.07] bg-white/[0.035] p-3 text-left hover:border-[#c8a24c]/40">
                                <p className="font-semibold">{conversation.subject}</p>
                                <p className="mt-1 truncate text-sm text-white/48">{conversation.last_message_preview ?? '-'}</p>
                            </button>
                        ))}
                    </div>
                </EmployeePanel>
                <EmployeePanel>
                    <EmployeePanelTitle title={detail?.subject ?? t('Conversation')} icon={Headphones} />
                    {!detail ? (
                        <p className="p-10 text-center text-white/50">{t('Selectionnez ou creez une conversation.')}</p>
                    ) : (
                        <div className="flex h-[min(620px,calc(100dvh-220px))] min-h-[420px] flex-col">
                            <div className="flex-1 space-y-3 overflow-y-auto p-4">
                                {detail.messages.map((message) => (
                                    <div key={message.id} className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[88%] rounded-md px-4 py-3 text-sm sm:max-w-[80%] ${message.is_mine ? 'bg-[#c8a24c] text-[#07101d]' : 'bg-white/[0.07] text-white'}`}>
                                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                            {message.created_at && <p className="mt-1 text-[10px] opacity-65">{formatRelativeTime(message.created_at)}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <form
                                className="flex gap-2 border-t border-white/[0.07] p-3 sm:p-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (selectedId && reply) replyMutation.mutate({ id: selectedId, message: reply });
                                }}
                            >
                                <Input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t('Nouveau message')} className="border-white/[0.08] bg-white/[0.04] text-white" />
                                <Button type="submit" variant="accent" disabled={!reply || replyMutation.isPending}>
                                    {replyMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                                </Button>
                            </form>
                        </div>
                    )}
                </EmployeePanel>
            </div>
        </EmployeePageShell>
    );
}
