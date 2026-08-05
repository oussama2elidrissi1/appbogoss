import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, Search, SendHorizonal, Trash2 } from 'lucide-react';
import {
    addPrestationItem,
    cancelPrestation,
    completePrestationServices,
    createPrestation,
    getErrorMessage,
    getPrestations,
    getServices,
    removePrestationItem,
    sendPrestationToCaisse,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatCurrency } from '@/lib/utils';
import { CATEGORIES, type CategoryConfig } from '@/components/workday/categories';
import { ClientPicker, EMPTY_CLIENT_SELECTION, type ClientSelection } from '@/components/workday/ClientPicker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Service } from '@/types/workday';

const OPEN_STATUSES = ['draft', 'in_progress', 'services_done', 'pending_payment'];

const STATUS_LABELS: Record<string, string> = {
    draft: 'Brouillon',
    in_progress: 'En cours',
    services_done: 'Services terminés',
    pending_payment: 'En attente de paiement',
};

export function NewPrestationPanel() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [clientSelection, setClientSelection] = useState<ClientSelection>(EMPTY_CLIENT_SELECTION);
    const [category, setCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // An employee only sees the categories they actually work in (set on
    // their profile) — no restriction configured means show everything, so
    // existing employees aren't suddenly locked out of categories nobody set up yet.
    const allowedCategories = useMemo(() => {
        const allowed = user?.employee_service_categories ?? [];
        if (allowed.length === 0) return CATEGORIES;
        const filtered = CATEGORIES.filter((option) => allowed.includes(option.value));
        return filtered.length > 0 ? filtered : CATEGORIES;
    }, [user]);

    useEffect(() => {
        if (!allowedCategories.includes(category)) {
            setCategory(allowedCategories[0]);
        }
    }, [allowedCategories, category]);

    const { data: myPrestations, isPending: prestationsPending } = useQuery({
        queryKey: ['prestations', 'mine'],
        queryFn: () => getPrestations(),
        refetchInterval: 10_000,
    });

    const openPrestation = useMemo(
        () => (myPrestations ?? []).find((prestation) => OPEN_STATUSES.includes(prestation.status)) ?? null,
        [myPrestations],
    );

    const { data: services, isPending: servicesPending } = useQuery({
        queryKey: ['services', category.value, 'all'],
        queryFn: () => getServices(category.value),
        staleTime: 60_000,
    });

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        const list = services ?? [];
        if (!term) return list;
        return list.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceSearch]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['prestations'] });
    }

    const createMutation = useMutation({
        mutationFn: (service: Service) =>
            createPrestation({
                client_id: clientSelection.mode === 'client' ? clientSelection.client?.id ?? null : null,
                client_label: clientSelection.mode === 'walkin' ? clientSelection.label.trim() || null : null,
                items: [{ service_id: service.id }],
            }),
        onSuccess: invalidate,
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const addItemMutation = useMutation({
        mutationFn: (service: Service) =>
            addPrestationItem(openPrestation!.id, { service_id: service.id }),
        onSuccess: invalidate,
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const removeItemMutation = useMutation({
        mutationFn: (itemId: number) => removePrestationItem(openPrestation!.id, itemId),
        onSuccess: invalidate,
    });

    const completeMutation = useMutation({
        mutationFn: () => completePrestationServices(openPrestation!.id),
        onSuccess: invalidate,
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const sendMutation = useMutation({
        mutationFn: () => sendPrestationToCaisse(openPrestation!.id),
        onSuccess: invalidate,
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const cancelMutation = useMutation({
        mutationFn: () => cancelPrestation(openPrestation!.id, 'Annulée par l’employé'),
        onSuccess: () => {
            invalidate();
            setCancelling(false);
        },
    });

    function handleServiceClick(service: Service) {
        setActionError(null);
        if (openPrestation) {
            addItemMutation.mutate(service);
        } else {
            createMutation.mutate(service);
        }
    }

    if (prestationsPending) {
        return (
            <Card className="space-y-3 p-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-24 w-full" />
            </Card>
        );
    }

    if (openPrestation) {
        const editable = ['draft', 'in_progress'].includes(openPrestation.status);
        const servicesDone = openPrestation.status === 'services_done';
        const pending = openPrestation.status === 'pending_payment';

        return (
            <>
                <Card className="space-y-5 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Prestation en cours · {openPrestation.reference}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {openPrestation.client_name ?? 'Client de passage'}
                            </p>
                        </div>
                        <Badge variant={pending ? 'accent' : 'success'}>
                            {STATUS_LABELS[openPrestation.status] ?? openPrestation.status}
                        </Badge>
                    </div>

                    <div className="space-y-2">
                        {openPrestation.items.length === 0 ? (
                            <p className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                Ajoutez un premier service ci-dessous.
                            </p>
                        ) : (
                            openPrestation.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3.5 py-2.5"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Qté {item.quantity} · {formatCurrency(item.unit_price)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold tabular-nums text-accent">
                                            {formatCurrency(item.line_total)}
                                        </span>
                                        {editable && (
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label="Retirer"
                                                disabled={removeItemMutation.isPending}
                                                onClick={() => removeItemMutation.mutate(item.id)}
                                            >
                                                <Trash2 className="text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-tint/[0.06] pt-4">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-lg font-semibold tabular-nums">{formatCurrency(openPrestation.total)}</span>
                    </div>

                    {actionError && (
                        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{actionError}</p>
                        </div>
                    )}

                    {pending ? (
                        <p className="rounded-md border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm text-accent">
                            En attente de confirmation de paiement par la caisse.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {editable && (
                                <Button
                                    type="button"
                                    variant="accent"
                                    disabled={openPrestation.items.length === 0 || completeMutation.isPending}
                                    onClick={() => completeMutation.mutate()}
                                >
                                    {completeMutation.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                    Services terminés
                                </Button>
                            )}
                            {servicesDone && (
                                <Button type="button" variant="accent" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
                                    {sendMutation.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
                                    Envoyer à la caisse
                                </Button>
                            )}
                            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelling(true)}>
                                Annuler la prestation
                            </Button>
                        </div>
                    )}
                </Card>

                {editable && (
                    <ServiceGrid
                        category={category}
                        categories={allowedCategories}
                        onCategoryChange={setCategory}
                        search={serviceSearch}
                        onSearchChange={setServiceSearch}
                        services={filteredServices}
                        loading={servicesPending}
                        onSelect={handleServiceClick}
                        pending={addItemMutation.isPending}
                    />
                )}

                <ConfirmDialog
                    open={cancelling}
                    onOpenChange={setCancelling}
                    title="Annuler cette prestation ?"
                    description="Les services ajoutés seront perdus. Cette action est irréversible."
                    confirmLabel="Annuler la prestation"
                    loading={cancelMutation.isPending}
                    onConfirm={() => cancelMutation.mutate()}
                />
            </>
        );
    }

    return (
        <div className="space-y-5">
            <Card className="space-y-4 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Client</p>
                <ClientPicker value={clientSelection} onChange={setClientSelection} />
            </Card>

            {actionError && (
                <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{actionError}</p>
                </div>
            )}

            <ServiceGrid
                category={category}
                categories={allowedCategories}
                onCategoryChange={setCategory}
                search={serviceSearch}
                onSearchChange={setServiceSearch}
                services={filteredServices}
                loading={servicesPending}
                onSelect={handleServiceClick}
                pending={createMutation.isPending}
            />
        </div>
    );
}

function ServiceGrid({
    category,
    categories,
    onCategoryChange,
    search,
    onSearchChange,
    services,
    loading,
    onSelect,
    pending,
}: {
    category: CategoryConfig;
    categories: CategoryConfig[];
    onCategoryChange: (category: CategoryConfig) => void;
    search: string;
    onSearchChange: (value: string) => void;
    services: Service[];
    loading: boolean;
    onSelect: (service: Service) => void;
    pending: boolean;
}) {
    return (
        <Card className="space-y-4 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Ajouter un service
            </p>

            {categories.length > 1 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {categories.map((option, index) => {
                        const Icon = option.icon;
                        const selected = category.value === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onCategoryChange(option)}
                                className={cn(
                                    'relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-2 text-center transition-all duration-200 active:scale-[0.98]',
                                    selected
                                        ? 'border-accent/60 bg-accent/[0.12] text-foreground shadow-glow'
                                        : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:bg-tint/[0.06] hover:text-foreground',
                                )}
                            >
                                <Icon className={cn('h-4 w-4', selected ? option.chip : 'text-muted-foreground')} />
                                <span className="truncate text-xs font-medium">{option.label}</span>
                                <span className="absolute right-1.5 top-1.5 text-[10px] font-semibold text-muted-foreground/50">
                                    {index + 1}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={`Rechercher une prestation ${category.label.toLowerCase()}...`}
                    className="pl-10"
                />
            </div>

            {loading ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 rounded-md" />
                    ))}
                </div>
            ) : services.length === 0 ? (
                <div className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                    Aucun service dans cette catégorie.
                </div>
            ) : (
                <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                    {services.map((service) => (
                        <button
                            key={service.id}
                            type="button"
                            disabled={pending}
                            onClick={() => onSelect(service)}
                            className={cn(
                                'flex items-center justify-between gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3.5 py-2.5 text-left transition-all duration-200',
                                'hover:border-accent/30 hover:bg-tint/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
                            )}
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">{service.name}</span>
                                <span className="block text-xs text-muted-foreground">{service.duration_minutes} min</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                {formatCurrency(service.price, { maximumFractionDigits: 2 })}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
}
