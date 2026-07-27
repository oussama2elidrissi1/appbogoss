import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Search, Sparkles, UserRound, X } from 'lucide-react';
import { getClients } from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';
import type { Client } from '@/types/workday';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';

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
 */
export function ClientPicker({ value, onChange }: ClientPickerProps) {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const enabled = value.mode === 'client' && debounced.length >= 2;

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
    }

    function clearClient() {
        onChange({ mode: 'client', client: null, label: '' });
        setSearch('');
        setDebounced('');
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
    }

    return (
        <div ref={containerRef} className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <Chip
                    size="sm"
                    selected={value.mode === 'client'}
                    onClick={() => setWalkIn(false)}
                >
                    <UserRound />
                    Client fiché
                </Chip>
                <Chip size="sm" selected={value.mode === 'walkin'} onClick={() => setWalkIn(true)}>
                    <Sparkles />
                    Client de passage
                </Chip>
            </div>

            {value.mode === 'walkin' ? (
                <Input
                    placeholder="Nom du client (optionnel)"
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
                        className="rounded-sm p-1 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Retirer le client</span>
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
                        placeholder="Rechercher un client…"
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
                                className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-md border border-white/[0.08] bg-popover p-1.5 shadow-soft-lg"
                            >
                                {(clients ?? []).length === 0 ? (
                                    <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                                        {isFetching
                                            ? 'Recherche…'
                                            : 'Aucun client trouvé — utilisez « Client de passage ».'}
                                    </li>
                                ) : (
                                    (clients ?? []).map((client) => (
                                        <li key={client.id}>
                                            <button
                                                type="button"
                                                onClick={() => selectClient(client)}
                                                className={cn(
                                                    'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-left',
                                                    'transition-colors duration-150 hover:bg-white/[0.06]',
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
                                                {client.loyalty_points > 0 && (
                                                    <span className="shrink-0 text-xs font-medium tabular-nums text-accent">
                                                        {client.loyalty_points} pts
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    ))
                                )}
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
