import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, Search, Sparkles, UserPlus, UserRound, X } from 'lucide-react';
import { createClient, getClients, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Client } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ClientSelection {
    mode: 'client' | 'walkin';
    client: Client | null;
    /** Free-text name used when `mode === 'walkin'`. */
    label: string;
}

export const EMPTY_CLIENT_SELECTION: ClientSelection = {
    mode: 'client',
    client: null,
    label: '',
};

interface ClientPickerProps {
    value: ClientSelection;
    onChange: (value: ClientSelection) => void;
}

/**
 * Hand-built combobox: a debounced search over `GET /api/clients` with a
 * "client de passage" escape hatch that maps to `client_label` instead of
 * `client_id`. No extra dependency — the dropdown is a positioned list.
 *
 * "Nouveau client" is a third, always-visible chip (not hidden behind
 * "search, find nothing, then notice a tiny link") — clicking it swaps the
 * whole picker body for a small creation form, independent of the search
 * dropdown's own open/closed state.
 */
export function ClientPicker({ value, onChange }: ClientPickerProps) {
    const { t } = useI18n();
    const { hasPermission } = useAuth();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const canCreateClient = hasPermission('caisse.manage');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    // Close the dropdown on any click outside the picker.
    useEffect(() => {
        function onPointerDown(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    const enabled = !creating && value.mode === 'client' && debounced.length >= 2;

    const { data: clients, isFetching } = useQuery({
        queryKey: workDayKeys.clients(debounced),
        queryFn: () => getClients(debounced),
        enabled,
        staleTime: 30_000,
    });

    function selectClient(client: Client) {
        onChange({ mode: 'client', client, label: '' });
        setSearch('');
        setDebounced('');
        setOpen(false);
        setCreating(false);
    }

    const createMutation = useMutation({
        mutationFn: createClient,
        onSuccess: (client) => {
            void queryClient.invalidateQueries({ queryKey: ['clients'] });
            selectClient(client);
            setNewName('');
            setNewPhone('');
        },
    });

    function startCreating() {
        setNewName(search.trim());
        setNewPhone('');
        setOpen(false);
        setCreating(true);
    }

    function cancelCreating() {
        setCreating(false);
        createMutation.reset();
    }

    function submitCreate() {
        const name = newName.trim();
        if (!name) return;
        createMutation.mutate({ name, phone: newPhone.trim() || null });
    }

    function clearClient() {
        onChange({ mode: 'client', client: null, label: '' });
        setSearch('');
        setDebounced('');
        setCreating(false);
    }

    function setWalkIn(on: boolean) {
        onChange(
            on
                ? { mode: 'walkin', client: null, label: '' }
                : { mode: 'client', client: null, label: '' },
        );
        setSearch('');
        setDebounced('');
        setOpen(false);
        setCreating(false);
    }

    return (
        <div ref={containerRef} className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <Chip
                    size="sm"
                    selected={value.mode === 'client' && !creating}
                    onClick={() => setWalkIn(false)}
                >
                    <UserRound />
                    {t('Client fiché')}
                </Chip>
                <Chip size="sm" selected={value.mode === 'walkin'} onClick={() => setWalkIn(true)}>
                    <Sparkles />
                    {t('Client de passage')}
                </Chip>
                {canCreateClient && (
                    <Chip size="sm" selected={creating} onClick={() => (creating ? cancelCreating() : startCreating())}>
                        <UserPlus />
                        {t('Nouveau client')}
                    </Chip>
                )}
            </div>

            {creating ? (
                <div className="space-y-2.5 rounded-md border border-accent/30 bg-accent/[0.04] p-3.5">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-name" className="text-xs">{t('Nom')}</Label>
                            <Input
                                id="new-client-name"
                                value={newName}
                                onChange={(event) => setNewName(event.target.value)}
                                placeholder={t('Nom du client')}
                                className="h-9"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-client-phone" className="text-xs">
                                {t('Téléphone')} <span className="font-normal">{t('(optionnel)')}</span>
                            </Label>
                            <Input
                                id="new-client-phone"
                                value={newPhone}
                                onChange={(event) => setNewPhone(event.target.value)}
                                placeholder="06 00 00 00 00"
                                className="h-9"
                            />
                        </div>
                    </div>
                    {createMutation.isError && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2">
                            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                            <p className="text-xs text-destructive">{getErrorMessage(createMutation.error)}</p>
                        </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={cancelCreating}>
                            {t('Annuler')}
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            size="sm"
                            disabled={!newName.trim() || createMutation.isPending}
                            onClick={submitCreate}
                        >
                            {createMutation.isPending && <Loader2 className="animate-spin" />}
                            {t('Créer le client')}
                        </Button>
                    </div>
                </div>
            ) : value.mode === 'walkin' ? (
                <Input
                    placeholder={t('Nom du client (optionnel)')}
                    value={value.label}
                    onChange={(event) =>
                        onChange({ mode: 'walkin', client: null, label: event.target.value })
                    }
                />
            ) : value.client ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/[0.08] px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.16]">
                            <Check className="h-3.5 w-3.5 text-accent" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                                {value.client.name}
                            </p>
                            {value.client.phone && (
                                <p className="truncate text-xs text-muted-foreground">
                                    {value.client.phone}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={clearClient}
                        className="rounded-sm p-1 text-muted-foreground transition-colors duration-200 hover:bg-tint/[0.06] hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">{t('Retirer le client')}</span>
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        placeholder={t('Rechercher un client…')}
                        className="pl-10"
                    />
                    {isFetching && (
                        <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/70" />
                    )}

                    <AnimatePresence>
                        {open && enabled && (
                            <motion.ul
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-md border border-tint/[0.08] bg-popover p-1.5 shadow-soft-lg"
                            >
                                {(clients ?? []).length === 0 ? (
                                    <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                                        {isFetching
                                            ? t('Recherche…')
                                            : canCreateClient
                                              ? t('Aucun client trouvé.')
                                              : t('Aucun client trouvé — utilisez « Client de passage ».')}
                                    </li>
                                ) : (
                                    (clients ?? []).map((client) => (
                                        <li key={client.id}>
                                            <button
                                                type="button"
                                                onClick={() => selectClient(client)}
                                                className={cn(
                                                    'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-left',
                                                    'transition-colors duration-150 hover:bg-tint/[0.06]',
                                                )}
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium text-foreground">
                                                        {client.name}
                                                    </span>
                                                    {client.phone && (
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {client.phone}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    ))
                                )}

                                {canCreateClient && !isFetching && (
                                    <li className={cn((clients ?? []).length > 0 && 'mt-1 border-t border-tint/[0.06] pt-1')}>
                                        <button
                                            type="button"
                                            onClick={startCreating}
                                            className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-medium text-accent transition-colors duration-150 hover:bg-tint/[0.06]"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            {t('Créer un nouveau client')}
                                            {search.trim() ? ` « ${search.trim()} »` : ''}
                                        </button>
                                    </li>
                                )}
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
