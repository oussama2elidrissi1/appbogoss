import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Gift,
    Loader2,
    Pencil,
    Search,
    SendHorizonal,
    Sparkles,
    Trash2,
} from 'lucide-react';
import {
    addPrestationItem,
    cancelPrestation,
    completePrestationServices,
    createPrestation,
    getClientLoyaltyStatus,
    getErrorMessage,
    getPrestations,
    getServices,
    removePrestationItem,
    sendPrestationToCaisse,
    updatePrestationItem,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import { CATEGORIES, type CategoryConfig } from '@/components/workday/categories';
import { ClientPicker, EMPTY_CLIENT_SELECTION, type ClientSelection } from '@/components/workday/ClientPicker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { AddPrestationItemPayload, PrestationItem } from '@/types/prestation';
import type { Service } from '@/types/workday';
import type { ClientLoyaltyReward, ClientLoyaltyStatus } from '@/types/loyalty';

type Redemption =
    | { kind: 'reward'; rewardId: number }
    | { kind: 'subscription'; subscriptionId: number; planServiceId: number; exceptionOverride: boolean };

interface SubscriptionOption {
    subscriptionId: number;
    planServiceId: number;
    planName: string | null;
    periodRemaining: number | null;
    totalRemaining: number | null;
}

// Only these keep the cart editable and block starting a new one. Once a
// prestation is sent to the caisse (pending_payment) it moves out of the way
// so the employee can start a fresh cart for the next client right away,
// instead of being stuck waiting for the caissier to confirm the first one.
const EDITABLE_STATUSES = ['draft', 'in_progress', 'services_done'];

const STATUS_LABELS: Record<string, string> = {
    draft: 'Brouillon',
    in_progress: 'En cours',
    services_done: 'Services terminés',
    pending_payment: 'En attente de paiement',
};

export function NewPrestationPanel() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const { user, hasPermission } = useAuth();
    const [clientSelection, setClientSelection] = useState<ClientSelection>(EMPTY_CLIENT_SELECTION);
    const [category, setCategory] = useState<CategoryConfig>(CATEGORIES[0]);
    const [serviceSearch, setServiceSearch] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pendingService, setPendingService] = useState<Service | null>(null);
    const [priceInput, setPriceInput] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editPriceInput, setEditPriceInput] = useState('');
    const [cancellingPendingId, setCancellingPendingId] = useState<number | null>(null);
    const [redemption, setRedemption] = useState<Redemption | null>(null);
    const [overrideReason, setOverrideReason] = useState('');

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
        () => (myPrestations ?? []).find((prestation) => EDITABLE_STATUSES.includes(prestation.status)) ?? null,
        [myPrestations],
    );

    // Sent to caisse but not yet confirmed — shown as trackable cards, never
    // blocking a new cart from being started in the meantime.
    const pendingPrestations = useMemo(
        () =>
            (myPrestations ?? [])
                .filter((prestation) => prestation.status === 'pending_payment')
                .sort((a, b) => {
                    const aDate = a.validated_at ?? a.created_at;
                    const bDate = b.validated_at ?? b.created_at;
                    return bDate.localeCompare(aDate);
                }),
        [myPrestations],
    );

    const { data: services, isPending: servicesPending } = useQuery({
        queryKey: ['services', category.value, 'all'],
        queryFn: () => getServices(category.value),
        staleTime: 60_000,
    });

    const canRedeem = hasPermission('loyalty.redeem');
    const canOverrideQuota = hasPermission('loyalty.override_quota');
    const currentClientId = openPrestation
        ? openPrestation.client_id
        : clientSelection.mode === 'client'
          ? (clientSelection.client?.id ?? null)
          : null;

    const { data: loyaltyStatus } = useQuery({
        queryKey: ['loyalty-status', currentClientId],
        queryFn: () => getClientLoyaltyStatus(currentClientId!),
        enabled: canRedeem && currentClientId != null,
    });

    // Narrower than the category tabs: an explicit per-service allow-list set
    // on the employee's profile (empty means no further restriction).
    const allowedServiceIds = user?.employee_allowed_service_ids ?? [];

    const filteredServices = useMemo(() => {
        const term = serviceSearch.trim().toLowerCase();
        let list = services ?? [];
        if (allowedServiceIds.length > 0) {
            list = list.filter((service) => allowedServiceIds.includes(service.id));
        }
        if (!term) return list;
        return list.filter((service) => service.name.toLowerCase().includes(term));
    }, [services, serviceSearch, allowedServiceIds]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['prestations'] });
    }

    function invalidateLoyalty() {
        void queryClient.invalidateQueries({ queryKey: ['loyalty-status'] });
    }

    const createMutation = useMutation({
        mutationFn: (itemPayload: AddPrestationItemPayload) =>
            createPrestation({
                client_id: clientSelection.mode === 'client' ? (clientSelection.client?.id ?? null) : null,
                client_label: clientSelection.mode === 'walkin' ? clientSelection.label.trim() || null : null,
                items: [itemPayload],
            }),
        onSuccess: () => {
            invalidate();
            invalidateLoyalty();
            setPendingService(null);
        },
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const addItemMutation = useMutation({
        mutationFn: (itemPayload: AddPrestationItemPayload) => addPrestationItem(openPrestation!.id, itemPayload),
        onSuccess: () => {
            invalidate();
            invalidateLoyalty();
            setPendingService(null);
        },
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const updateItemMutation = useMutation({
        mutationFn: ({ itemId, unitPrice }: { itemId: number; unitPrice: number }) =>
            updatePrestationItem(openPrestation!.id, itemId, { unit_price: unitPrice }),
        onSuccess: () => {
            invalidate();
            setEditingItemId(null);
        },
        onError: (error) => setActionError(getErrorMessage(error)),
    });

    const removeItemMutation = useMutation({
        mutationFn: (itemId: number) => removePrestationItem(openPrestation!.id, itemId),
        onSuccess: () => {
            invalidate();
            invalidateLoyalty();
        },
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
            invalidateLoyalty();
            setCancelling(false);
        },
    });

    const cancelPendingMutation = useMutation({
        mutationFn: (prestationId: number) => cancelPrestation(prestationId, 'Annulée par l’employé'),
        onSuccess: () => {
            invalidate();
            invalidateLoyalty();
            setCancellingPendingId(null);
        },
    });

    function openAddServiceDialog(service: Service) {
        setActionError(null);
        setPendingService(service);
        setPriceInput(String(service.price));
        setRedemption(null);
        setOverrideReason('');
    }

    const applicableRewards: ClientLoyaltyReward[] = useMemo(() => {
        if (!loyaltyStatus || !pendingService) return [];
        return loyaltyStatus.rewards.filter((reward) => reward.service_id === null || reward.service_id === pendingService.id);
    }, [loyaltyStatus, pendingService]);

    const applicableSubscriptionOptions: SubscriptionOption[] = useMemo(() => {
        if (!loyaltyStatus || !pendingService) return [];
        const options: SubscriptionOption[] = [];
        for (const subscription of loyaltyStatus.subscriptions) {
            for (const planService of subscription.services) {
                if (planService.service_id === pendingService.id) {
                    options.push({
                        subscriptionId: subscription.id,
                        planServiceId: planService.subscription_plan_service_id,
                        planName: subscription.plan_name,
                        periodRemaining: planService.period_remaining,
                        totalRemaining: planService.total_remaining,
                    });
                }
            }
        }
        return options;
    }, [loyaltyStatus, pendingService]);

    function confirmAddService() {
        if (!pendingService) return;

        let itemPayload: AddPrestationItemPayload;

        if (redemption?.kind === 'reward') {
            itemPayload = { service_id: pendingService.id, loyalty_reward_id: redemption.rewardId };
        } else if (redemption?.kind === 'subscription') {
            if (redemption.exceptionOverride && !overrideReason.trim()) return;
            itemPayload = {
                service_id: pendingService.id,
                client_subscription_id: redemption.subscriptionId,
                subscription_plan_service_id: redemption.planServiceId,
                ...(redemption.exceptionOverride
                    ? { exception_override: true, override_reason: overrideReason.trim() }
                    : {}),
            };
        } else {
            const unitPrice = Number.parseFloat(priceInput.replace(',', '.'));
            if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
            itemPayload = { service_id: pendingService.id, unit_price: unitPrice };
        }

        if (openPrestation) {
            addItemMutation.mutate(itemPayload);
        } else {
            createMutation.mutate(itemPayload);
        }
    }

    function startEditPrice(item: PrestationItem) {
        setActionError(null);
        setEditingItemId(item.id);
        setEditPriceInput(String(item.unit_price));
    }

    function confirmEditPrice() {
        if (editingItemId === null) return;
        const unitPrice = Number.parseFloat(editPriceInput.replace(',', '.'));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
        updateItemMutation.mutate({ itemId: editingItemId, unitPrice });
    }

    const addServicePending = createMutation.isPending || addItemMutation.isPending;

    if (prestationsPending) {
        return (
            <Card className="space-y-3 p-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-24 w-full" />
            </Card>
        );
    }

    const pendingSection = pendingPrestations.length > 0 && (
        <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('En attente de confirmation')} ({pendingPrestations.length})
            </p>
            {pendingPrestations.map((prestation) => (
                <Card key={prestation.id} className="space-y-2.5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                                {prestation.reference} · {prestation.client_name ?? t('Client de passage')}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {prestation.items.map((item) => item.label).join(', ')}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-accent">
                                {formatCurrency(prestation.total)}
                            </span>
                            <Badge variant="accent">{t('Envoyée à la caisse')}</Badge>
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-tint/[0.06] pt-2.5">
                        <p className="text-xs text-muted-foreground">
                            {t('En attente de confirmation de paiement par la caisse.')}
                        </p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setCancellingPendingId(prestation.id)}
                        >
                            {t('Annuler')}
                        </Button>
                    </div>
                </Card>
            ))}
        </div>
    );

    if (openPrestation) {
        const editable = ['draft', 'in_progress'].includes(openPrestation.status);
        const servicesDone = openPrestation.status === 'services_done';

        return (
            <div className="space-y-5">
                {pendingSection}

                <Card className="space-y-5 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {t('Prestation en cours')} · {openPrestation.reference}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {openPrestation.client_name ?? t('Client de passage')}
                            </p>
                        </div>
                        <Badge variant="success">
                            {t(STATUS_LABELS[openPrestation.status] ?? openPrestation.status)}
                        </Badge>
                    </div>

                    {canRedeem && <ClientLoyaltyPanel status={loyaltyStatus} />}

                    <div className="space-y-2">
                        {openPrestation.items.length === 0 ? (
                            <p className="rounded-md border border-dashed border-tint/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                                {t('Ajoutez un premier service ci-dessous.')}
                            </p>
                        ) : (
                            openPrestation.items.map((item) => {
                                const isEditingPrice = editingItemId === item.id;

                                return (
                                    <div
                                        key={item.id}
                                        className="rounded-md border border-tint/[0.08] bg-tint/[0.02] px-3.5 py-2.5"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                                                    {item.is_free && (
                                                        <Badge variant="accent" className="shrink-0">
                                                            {item.loyalty_reward_id ? t('Récompense') : t('Abonnement')}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {t('Qté')} {item.quantity} · {formatCurrency(item.unit_price)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-semibold tabular-nums text-accent">
                                                    {formatCurrency(item.line_total)}
                                                </span>
                                                {editable && (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label={t('Modifier le montant')}
                                                            onClick={() =>
                                                                isEditingPrice
                                                                    ? setEditingItemId(null)
                                                                    : startEditPrice(item)
                                                            }
                                                        >
                                                            <Pencil className={cn('h-4 w-4', isEditingPrice && 'text-accent')} />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label={t('Retirer')}
                                                            disabled={removeItemMutation.isPending}
                                                            onClick={() => removeItemMutation.mutate(item.id)}
                                                        >
                                                            <Trash2 className="text-destructive" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {isEditingPrice && (
                                            <div className="mt-2.5 flex items-center gap-2 border-t border-tint/[0.06] pt-2.5">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    inputMode="decimal"
                                                    autoFocus
                                                    value={editPriceInput}
                                                    onChange={(event) => setEditPriceInput(event.target.value)}
                                                    className="h-8 flex-1 tabular-nums"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="accent"
                                                    size="sm"
                                                    disabled={updateItemMutation.isPending}
                                                    onClick={confirmEditPrice}
                                                >
                                                    {updateItemMutation.isPending && <Loader2 className="animate-spin" />}
                                                    {t('Enregistrer')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-tint/[0.06] pt-4">
                        <span className="text-sm text-muted-foreground">{t('Total')}</span>
                        <span className="text-lg font-semibold tabular-nums">{formatCurrency(openPrestation.total)}</span>
                    </div>

                    {actionError && (
                        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{actionError}</p>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        {editable && (
                            <Button
                                type="button"
                                variant="accent"
                                disabled={openPrestation.items.length === 0 || completeMutation.isPending}
                                onClick={() => completeMutation.mutate()}
                            >
                                {completeMutation.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                                {t('Services terminés')}
                            </Button>
                        )}
                        {servicesDone && (
                            <Button type="button" variant="accent" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
                                {sendMutation.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
                                {t('Envoyer à la caisse')}
                            </Button>
                        )}
                        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelling(true)}>
                            {t('Annuler la prestation')}
                        </Button>
                    </div>
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
                        onSelect={openAddServiceDialog}
                        pending={addServicePending}
                    />
                )}

                <ConfirmDialog
                    open={cancelling}
                    onOpenChange={setCancelling}
                    title={t('Annuler cette prestation ?')}
                    description={t('Les services ajoutés seront perdus. Cette action est irréversible.')}
                    confirmLabel={t('Annuler la prestation')}
                    loading={cancelMutation.isPending}
                    onConfirm={() => cancelMutation.mutate()}
                />

                <ConfirmDialog
                    open={cancellingPendingId !== null}
                    onOpenChange={(open) => {
                        if (!open) setCancellingPendingId(null);
                    }}
                    title={t('Annuler cette prestation envoyée à la caisse ?')}
                    description={t('Le caissier ne pourra plus confirmer ce paiement. Cette action est irréversible.')}
                    confirmLabel={t('Annuler la prestation')}
                    loading={cancelPendingMutation.isPending}
                    onConfirm={() => {
                        if (cancellingPendingId !== null) cancelPendingMutation.mutate(cancellingPendingId);
                    }}
                />

                <AddServiceDialog
                    service={pendingService}
                    price={priceInput}
                    onPriceChange={setPriceInput}
                    onOpenChange={(open) => {
                        if (!open) setPendingService(null);
                    }}
                    onConfirm={confirmAddService}
                    pending={addServicePending}
                    error={actionError}
                    rewards={applicableRewards}
                    subscriptionOptions={applicableSubscriptionOptions}
                    redemption={redemption}
                    onRedemptionChange={setRedemption}
                    canOverrideQuota={canOverrideQuota}
                    overrideReason={overrideReason}
                    onOverrideReasonChange={setOverrideReason}
                />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {pendingSection}

            <Card className="space-y-4 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Client')}</p>
                <ClientPicker value={clientSelection} onChange={setClientSelection} />
                {canRedeem && currentClientId != null && <ClientLoyaltyPanel status={loyaltyStatus} />}
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
                onSelect={openAddServiceDialog}
                pending={addServicePending}
            />

            <ConfirmDialog
                open={cancellingPendingId !== null}
                onOpenChange={(open) => {
                    if (!open) setCancellingPendingId(null);
                }}
                title={t('Annuler cette prestation envoyée à la caisse ?')}
                description={t('Le caissier ne pourra plus confirmer ce paiement. Cette action est irréversible.')}
                confirmLabel={t('Annuler la prestation')}
                loading={cancelPendingMutation.isPending}
                onConfirm={() => {
                    if (cancellingPendingId !== null) cancelPendingMutation.mutate(cancellingPendingId);
                }}
            />

            <AddServiceDialog
                service={pendingService}
                price={priceInput}
                onPriceChange={setPriceInput}
                onOpenChange={(open) => {
                    if (!open) setPendingService(null);
                }}
                onConfirm={confirmAddService}
                pending={addServicePending}
                error={actionError}
                rewards={applicableRewards}
                subscriptionOptions={applicableSubscriptionOptions}
                redemption={redemption}
                onRedemptionChange={setRedemption}
                canOverrideQuota={canOverrideQuota}
                overrideReason={overrideReason}
                onOverrideReasonChange={setOverrideReason}
            />
        </div>
    );
}

function ClientLoyaltyPanel({ status }: { status: ClientLoyaltyStatus | undefined }) {
    const { t } = useI18n();
    if (!status) return null;
    if (status.points_balance === 0 && status.rewards.length === 0 && status.subscriptions.length === 0) return null;

    return (
        <div className="space-y-2 rounded-md border border-accent/20 bg-accent/[0.04] p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent">{t('Compte fidélité')}</p>
            <div className="flex flex-wrap gap-2">
                {status.points_balance > 0 && <Badge variant="outline">{status.points_balance} {t('points')}</Badge>}
                {status.rewards.map((reward) => (
                    <Badge key={reward.id} variant="accent">
                        <Gift className="h-3 w-3" />
                        {reward.program_name ?? t('Récompense')} {t('disponible')}
                    </Badge>
                ))}
                {status.subscriptions.map((subscription) => (
                    <Badge key={subscription.id} variant="outline">
                        <CalendarClock className="h-3 w-3" />
                        {subscription.plan_name}
                    </Badge>
                ))}
            </div>
        </div>
    );
}

function AddServiceDialog({
    service,
    price,
    onPriceChange,
    onOpenChange,
    onConfirm,
    pending,
    error,
    rewards,
    subscriptionOptions,
    redemption,
    onRedemptionChange,
    canOverrideQuota,
    overrideReason,
    onOverrideReasonChange,
}: {
    service: Service | null;
    price: string;
    onPriceChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    pending: boolean;
    error: string | null;
    rewards: ClientLoyaltyReward[];
    subscriptionOptions: SubscriptionOption[];
    redemption: Redemption | null;
    onRedemptionChange: (redemption: Redemption | null) => void;
    canOverrideQuota: boolean;
    overrideReason: string;
    onOverrideReasonChange: (value: string) => void;
}) {
    const { t } = useI18n();
    const priceValue = Number.parseFloat(price.replace(',', '.'));
    const canConfirm =
        redemption === null
            ? Number.isFinite(priceValue) && priceValue >= 0
            : redemption.kind === 'reward' || !redemption.exceptionOverride || overrideReason.trim().length > 0;
    const hasRedemptionOptions = rewards.length > 0 || subscriptionOptions.length > 0;

    return (
        <Dialog open={service !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{service?.name}</DialogTitle>
                    <DialogDescription>
                        {t('Confirmez le montant de ce service avant de l’ajouter à la prestation.')}
                    </DialogDescription>
                </DialogHeader>

                {hasRedemptionOptions && (
                    <div className="space-y-2">
                        <Label>{t('Mode')}</Label>
                        <div className="flex flex-wrap gap-2">
                            <Chip size="sm" selected={redemption === null} onClick={() => onRedemptionChange(null)}>
                                <Sparkles className="h-3.5 w-3.5" />
                                {t('Prix normal')}
                            </Chip>
                            {rewards.map((reward) => (
                                <Chip
                                    key={reward.id}
                                    size="sm"
                                    selected={redemption?.kind === 'reward' && redemption.rewardId === reward.id}
                                    onClick={() => onRedemptionChange({ kind: 'reward', rewardId: reward.id })}
                                >
                                    <Gift className="h-3.5 w-3.5" />
                                    {reward.program_name ?? t('Récompense')}
                                </Chip>
                            ))}
                            {subscriptionOptions.map((option) => {
                                const periodExhausted = option.periodRemaining !== null && option.periodRemaining <= 0;
                                const lifetimeExhausted = option.totalRemaining !== null && option.totalRemaining <= 0;
                                const disabled = lifetimeExhausted || (periodExhausted && !canOverrideQuota);
                                const selected =
                                    redemption?.kind === 'subscription' &&
                                    redemption.subscriptionId === option.subscriptionId &&
                                    redemption.planServiceId === option.planServiceId;

                                return (
                                    <Chip
                                        key={`${option.subscriptionId}-${option.planServiceId}`}
                                        size="sm"
                                        selected={selected}
                                        disabled={disabled}
                                        onClick={() =>
                                            onRedemptionChange({
                                                kind: 'subscription',
                                                subscriptionId: option.subscriptionId,
                                                planServiceId: option.planServiceId,
                                                exceptionOverride: periodExhausted,
                                            })
                                        }
                                    >
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {option.planName ?? t('Abonnement')}
                                        {lifetimeExhausted
                                            ? ` — ${t('épuisé')}`
                                            : periodExhausted
                                              ? ` — ${t('quota atteint')}`
                                              : option.periodRemaining !== null
                                                ? ` (${option.periodRemaining} ${t(option.periodRemaining > 1 ? 'restants' : 'restant')})`
                                                : ''}
                                    </Chip>
                                );
                            })}
                        </div>
                    </div>
                )}

                {redemption === null ? (
                    <div className="space-y-2">
                        <Label htmlFor="add-service-price">{t('Montant')}</Label>
                        <Input
                            id="add-service-price"
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            autoFocus
                            value={price}
                            onChange={(event) => onPriceChange(event.target.value)}
                            className="text-lg font-semibold tabular-nums"
                        />
                    </div>
                ) : (
                    <div className="rounded-md border border-accent/30 bg-accent/[0.06] px-3.5 py-3 text-sm text-accent">
                        {t('Ligne gratuite —')}{' '}
                        {redemption.kind === 'reward' ? t('récompense de fidélité.') : t('utilisation d’un abonnement.')}
                    </div>
                )}

                {redemption?.kind === 'subscription' && redemption.exceptionOverride && (
                    <div className="space-y-2">
                        <Label htmlFor="override-reason">{t('Motif de l’exception (quota déjà atteint)')}</Label>
                        <Input
                            id="override-reason"
                            value={overrideReason}
                            onChange={(event) => onOverrideReasonChange(event.target.value)}
                            placeholder={t('Geste commercial')}
                            autoFocus
                        />
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Annuler')}
                    </Button>
                    <Button type="button" variant="accent" disabled={!canConfirm || pending} onClick={onConfirm}>
                        {pending && <Loader2 className="animate-spin" />}
                        {t('Ajouter')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
    const { t } = useI18n();
    return (
        <Card className="space-y-4 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('Ajouter un service')}
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
                                <span className="truncate text-xs font-medium">{t(option.label)}</span>
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
                    placeholder={t('Rechercher une prestation {x}...', { x: t(category.label).toLowerCase() })}
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
                    {t('Aucun service dans cette catégorie.')}
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
                                <span className="block text-xs text-muted-foreground">{t('{n} min', { n: service.duration_minutes })}</span>
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
