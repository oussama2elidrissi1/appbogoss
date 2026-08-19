import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    CalendarCheck,
    Eye,
    Handshake,
    KeyRound,
    Pencil,
    Percent,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import {
    createPartner,
    deletePartner,
    getErrorMessage,
    getPartners,
    getServices,
    resetPartnerPassword,
    setPartnerStatus,
    updatePartner,
} from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Partner, PartnerPayload, PartnerStatus } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { CreatedAccountDialog, type CreatedAccount } from '@/components/workday/CreatedAccountDialog';
import { PartnerFormDialog } from '@/components/partners/PartnerFormDialog';
import { pageFade } from '@/lib/motion';

const STATUS_META: Record<PartnerStatus, { label: string; variant: 'success' | 'outline' | 'destructive' }> = {
    pending: { label: 'En attente', variant: 'outline' },
    active: { label: 'Actif', variant: 'success' },
    suspended: { label: 'Suspendu', variant: 'destructive' },
    disabled: { label: 'Désactivé', variant: 'destructive' },
};

export default function Partenaires() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
    const [resetTarget, setResetTarget] = useState<Partner | null>(null);
    const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);

    const {
        data: partners,
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['partners'],
        queryFn: () => getPartners(),
    });

    const { data: services } = useQuery({
        queryKey: ['services', 'all'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    const filteredPartners = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return partners ?? [];
        return (partners ?? []).filter((partner) =>
            [partner.name, partner.contact_name, partner.email, partner.phone, partner.login_email]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term)),
        );
    }, [partners, search]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['partners'] });
    }

    const createMutation = useMutation({
        mutationFn: createPartner,
        onSuccess: (result) => {
            invalidate();
            setFormOpen(false);
            if (result.temporary_password) {
                setCreatedAccount({
                    employeeName: result.partner.name,
                    loginEmail: result.login_email,
                    temporaryPassword: result.temporary_password,
                });
            }
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: PartnerPayload }) => updatePartner(id, payload),
        onSuccess: () => {
            invalidate();
            setFormOpen(false);
            setEditingPartner(null);
        },
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: number; status: PartnerStatus }) => setPartnerStatus(id, status),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: (partner: Partner) => deletePartner(partner.id),
        onSuccess: () => {
            invalidate();
            setDeleteTarget(null);
        },
    });

    const resetMutation = useMutation({
        mutationFn: (partner: Partner) => resetPartnerPassword(partner.id),
        onSuccess: (password, partner) => {
            setResetTarget(null);
            setCreatedAccount({
                employeeName: partner.name,
                loginEmail: partner.login_email ?? '',
                temporaryPassword: password,
            });
        },
    });

    function openCreate() {
        setEditingPartner(null);
        setFormOpen(true);
    }

    function openEdit(partner: Partner) {
        setEditingPartner(partner);
        setFormOpen(true);
    }

    function handleSubmit(payload: PartnerPayload) {
        if (editingPartner) {
            updateMutation.mutate({ id: editingPartner.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    return (
        <>
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Partenaires</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Hôtels, riads, guides… qui réservent pour leurs clients. Chaque partenaire a son
                            compte de connexion et sa commission par service (fixe ou pourcentage).
                        </p>
                    </div>
                    <Button variant="accent" onClick={openCreate}>
                        <Plus />
                        Nouveau partenaire
                    </Button>
                </div>

                <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Rechercher un partenaire..."
                        className="pl-10"
                    />
                </div>

                {isPending ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-20 w-full rounded-md" />
                        ))}
                    </div>
                ) : isError ? (
                    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                        <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                            Réessayer
                        </Button>
                    </Card>
                ) : filteredPartners.length === 0 ? (
                    <EmptyState
                        icon={Handshake}
                        title="Aucun partenaire"
                        description="Créez un compte partenaire pour lui permettre de réserver dans votre agenda."
                    />
                ) : (
                    <div className="space-y-2">
                        {filteredPartners.map((partner) => (
                            <Card
                                key={partner.id}
                                className={cn(
                                    'flex flex-wrap items-center gap-4 p-4',
                                    partner.status !== 'active' && 'opacity-70',
                                )}
                            >
                                <EmployeeAvatar name={partner.name} color="#5B6B85" />

                                <div className="min-w-[12rem] flex-1">
                                    <Link
                                        to={`/partenaires/${partner.id}`}
                                        className="truncate text-sm font-semibold text-foreground hover:text-accent hover:underline"
                                    >
                                        {partner.trade_name || partner.name}
                                    </Link>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {[partner.contact_name, partner.phone, partner.login_email]
                                            .filter(Boolean)
                                            .join(' · ') || 'Aucune coordonnée'}
                                    </p>
                                </div>

                                <Badge variant="outline" className="shrink-0 gap-1.5">
                                    <CalendarCheck className="h-3.5 w-3.5" />
                                    {partner.appointments_count ?? 0} réservation
                                    {(partner.appointments_count ?? 0) > 1 ? 's' : ''}
                                </Badge>

                                <Badge variant="outline" className="shrink-0 gap-1.5">
                                    <Percent className="h-3.5 w-3.5" />
                                    {partner.commissions?.length ?? 0} commission
                                    {(partner.commissions?.length ?? 0) > 1 ? 's' : ''}
                                </Badge>

                                <Select
                                    value={partner.status}
                                    onValueChange={(value) =>
                                        statusMutation.mutate({ id: partner.id, status: value as PartnerStatus })
                                    }
                                >
                                    <SelectTrigger className="h-8 w-[132px] shrink-0 border-none bg-transparent p-0">
                                        <Badge variant={STATUS_META[partner.status].variant} className="w-full justify-center">
                                            <SelectValue />
                                        </Badge>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(STATUS_META) as PartnerStatus[]).map((key) => (
                                            <SelectItem key={key} value={key}>
                                                {STATUS_META[key].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Voir la fiche"
                                        asChild
                                    >
                                        <Link to={`/partenaires/${partner.id}`}>
                                            <Eye />
                                        </Link>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Modifier le partenaire"
                                        onClick={() => openEdit(partner)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Réinitialiser le mot de passe"
                                        disabled={!partner.user_id}
                                        onClick={() => setResetTarget(partner)}
                                    >
                                        <KeyRound />
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Supprimer le partenaire"
                                        onClick={() => setDeleteTarget(partner)}
                                    >
                                        <Trash2 className="text-destructive" />
                                    </Button>
                                </div>

                                {partner.commissions && partner.commissions.length > 0 && (
                                    <div className="flex w-full flex-wrap gap-1.5 border-t border-tint/[0.06] pt-3">
                                        {partner.commissions.map((rule) => (
                                            <span
                                                key={rule.service_id}
                                                className="rounded-full border border-tint/[0.08] bg-tint/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground"
                                            >
                                                {rule.service_name ?? `Service ${rule.service_id}`}
                                                {' — '}
                                                <span className="font-semibold text-accent">
                                                    {rule.type === 'percentage'
                                                        ? `${rule.value}%`
                                                        : formatCurrency(rule.value, { maximumFractionDigits: 2 })}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </motion.div>

            <PartnerFormDialog
                open={formOpen}
                onOpenChange={(open) => {
                    setFormOpen(open);
                    if (!open) setEditingPartner(null);
                }}
                partner={editingPartner}
                services={services ?? []}
                saving={createMutation.isPending || updateMutation.isPending}
                error={
                    createMutation.isError
                        ? createMutation.error
                        : updateMutation.isError
                          ? updateMutation.error
                          : null
                }
                onSubmit={handleSubmit}
            />

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title="Supprimer ce partenaire ?"
                description={
                    deleteTarget
                        ? `${deleteTarget.name}, son compte de connexion et sa grille de commissions seront définitivement supprimés. Ses réservations existantes restent dans l'agenda.`
                        : undefined
                }
                confirmLabel="Supprimer"
                loading={deleteMutation.isPending}
                onConfirm={() => {
                    if (deleteTarget) deleteMutation.mutate(deleteTarget);
                }}
            />

            <ConfirmDialog
                open={resetTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setResetTarget(null);
                }}
                title="Réinitialiser le mot de passe ?"
                description={
                    resetTarget
                        ? `Un nouveau mot de passe sera généré pour ${resetTarget.name}. L'ancien ne fonctionnera plus.`
                        : undefined
                }
                confirmLabel="Réinitialiser"
                loading={resetMutation.isPending}
                onConfirm={() => {
                    if (resetTarget) resetMutation.mutate(resetTarget);
                }}
            />

            <CreatedAccountDialog account={createdAccount} onClose={() => setCreatedAccount(null)} />
        </>
    );
}
