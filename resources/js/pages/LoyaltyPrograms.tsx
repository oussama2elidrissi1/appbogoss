import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Gift, Loader2, Pencil, Phone, Plus, Power, Search, Trophy, Users } from 'lucide-react';
import {
    createLoyaltyProgram,
    deactivateLoyaltyProgram,
    getErrorMessage,
    getLoyaltyProgramProgress,
    getLoyaltyPrograms,
    getServices,
    updateLoyaltyProgram,
} from '@/lib/api';
import { cn, formatCurrency, formatRelativeTime, getInitials } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { CATEGORIES } from '@/components/workday/categories';
import type { CommissionBasis, LoyaltyProgram, LoyaltyProgramPayload, LoyaltyProgramType } from '@/types/loyalty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

const TYPE_LABELS: Record<LoyaltyProgramType, string> = {
    service_count: 'Nombre de services',
    points: 'Points',
    amount_spent: 'Montant dépensé',
    visit_count: 'Nombre de visites',
    birthday: 'Anniversaire',
    custom: 'Personnalisé',
};

const RULE_TYPES: LoyaltyProgramType[] = ['service_count', 'points', 'amount_spent', 'visit_count'];

const emptyForm = {
    name: '',
    description: '',
    type: 'service_count' as LoyaltyProgramType,
    is_active: true,
    category: '',
    service_id: '',
    points_per_mad: '1',
    threshold: '5',
    rollover_surplus: true,
    reward_expires_after_days: '30',
    reward_type: 'service' as 'service' | 'discount_percent' | 'discount_amount',
    reward_service_id: '',
    reward_value: '',
    commission_basis: 'public_price' as CommissionBasis,
    commission_value: '',
    conditions_json: '[]',
    starts_on: '',
    ends_on: '',
    notes: '',
};

type FormState = typeof emptyForm;

function programToForm(program: LoyaltyProgram): FormState {
    const config = program.config ?? {};
    const reward: NonNullable<typeof config.reward> = config.reward ?? { type: 'service' };

    return {
        name: program.name,
        description: program.description ?? '',
        type: program.type,
        is_active: program.is_active,
        category: (config.category as string) ?? '',
        service_id: config.service_id != null ? String(config.service_id) : '',
        points_per_mad: config.points_per_mad != null ? String(config.points_per_mad) : '1',
        threshold: config.threshold != null ? String(config.threshold) : '',
        rollover_surplus: config.rollover_surplus !== false,
        reward_expires_after_days:
            config.reward_expires_after_days != null ? String(config.reward_expires_after_days) : '',
        reward_type: (reward.type as FormState['reward_type']) ?? 'service',
        reward_service_id: reward.service_id != null ? String(reward.service_id) : '',
        reward_value: reward.value != null ? String(reward.value) : '',
        commission_basis: program.commission_basis ?? 'none',
        commission_value: program.commission_value != null ? String(program.commission_value) : '',
        conditions_json: JSON.stringify(config.conditions ?? [], null, 2),
        starts_on: program.starts_on ?? '',
        ends_on: program.ends_on ?? '',
        notes: program.notes ?? '',
    };
}

function formToPayload(form: FormState): LoyaltyProgramPayload {
    const isRuleType = RULE_TYPES.includes(form.type);
    const hasReward = form.type !== 'custom';

    const config: LoyaltyProgramPayload['config'] = {};

    if (isRuleType) {
        if (form.category.trim()) config.category = form.category.trim();
        if (form.service_id) config.service_id = Number(form.service_id);
        if (form.type === 'points') config.points_per_mad = Number(form.points_per_mad || 0);
        config.threshold = Number(form.threshold || 0);
        config.rollover_surplus = form.rollover_surplus;
        if (form.reward_expires_after_days.trim()) {
            config.reward_expires_after_days = Number(form.reward_expires_after_days);
        }
    }

    if (hasReward) {
        config.reward = {
            type: form.reward_type,
            ...(form.reward_type === 'service' && form.reward_service_id
                ? { service_id: Number(form.reward_service_id) }
                : {}),
            ...(form.reward_type !== 'service' && form.reward_value
                ? { value: Number(form.reward_value) }
                : {}),
        };
    }

    if (form.type === 'custom') {
        try {
            config.conditions = JSON.parse(form.conditions_json || '[]');
        } catch {
            config.conditions = [];
        }
    }

    return {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        is_active: form.is_active,
        config,
        commission_basis: form.commission_basis,
        commission_value: form.commission_value.trim() ? Number(form.commission_value) : null,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        notes: form.notes.trim() || null,
    };
}

export default function LoyaltyPrograms() {
    const { t } = useI18n();
    const queryClient = useQueryClient();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<LoyaltyProgram | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [progressProgram, setProgressProgram] = useState<LoyaltyProgram | null>(null);

    const programsQuery = useQuery({ queryKey: ['loyalty-programs'], queryFn: getLoyaltyPrograms });
    const servicesQuery = useQuery({ queryKey: ['services', 'all-for-loyalty'], queryFn: () => getServices() });

    const programs = programsQuery.data ?? [];
    const services = servicesQuery.data ?? [];

    const activeCount = useMemo(() => programs.filter((program) => program.is_active).length, [programs]);

    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['loyalty-programs'] });

    const createMutation = useMutation({
        mutationFn: createLoyaltyProgram,
        onSuccess: () => {
            refresh();
            closeDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: LoyaltyProgramPayload }) =>
            updateLoyaltyProgram(id, payload),
        onSuccess: () => {
            refresh();
            closeDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const toggleMutation = useMutation({
        mutationFn: (program: LoyaltyProgram) =>
            program.is_active
                ? deactivateLoyaltyProgram(program.id)
                : updateLoyaltyProgram(program.id, { ...programToFormPayload(program), is_active: true }),
        onSuccess: refresh,
    });

    function programToFormPayload(program: LoyaltyProgram): LoyaltyProgramPayload {
        return formToPayload(programToForm(program));
    }

    function openCreateDialog() {
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
        setDialogOpen(true);
    }

    function openEditDialog(program: LoyaltyProgram) {
        setEditing(program);
        setForm(programToForm(program));
        setFormError(null);
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        if (!form.name.trim()) {
            setFormError(t('Le nom est obligatoire.'));
            return;
        }

        const payload = formToPayload(form);

        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    const saving = createMutation.isPending || updateMutation.isPending;

    return (
        <>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
                <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">{t('Programmes de fidélité')}</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {t('Comptes fidélité numériques des clients — aucune carte, tout se joue sur le compte.')}
                        </p>
                    </div>
                    <Button variant="accent" onClick={openCreateDialog}>
                        <Plus />
                        {t('Nouveau programme')}
                    </Button>
                </motion.div>

                <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Stat label={t('Programmes')} value={programs.length} />
                    <Stat label={t('Actifs')} value={activeCount} tone="success" />
                </motion.div>

                {programsQuery.isError ? (
                    <ErrorCard
                        title={t('Impossible de charger les programmes')}
                        message={getErrorMessage(programsQuery.error)}
                        onRetry={() => void programsQuery.refetch()}
                    />
                ) : programsQuery.isPending ? (
                    <LoadingGrid />
                ) : programs.length === 0 ? (
                    <EmptyState
                        icon={Gift}
                        title={t('Aucun programme')}
                        description={t('Créez un programme de fidélité, par exemple « 5 Hammams = 1 Gratuit ».')}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {programs.map((program) => (
                            <motion.div key={program.id} variants={item} layout>
                                <Card className={cn('p-5', !program.is_active && 'opacity-75')}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-semibold text-foreground">{program.name}</h3>
                                            {program.description && (
                                                <p className="mt-1 text-xs text-muted-foreground">{program.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Badge variant="outline">{t(TYPE_LABELS[program.type])}</Badge>
                                        <Badge variant={program.is_active ? 'success' : 'outline'}>
                                            {program.is_active ? t('Actif') : t('Inactif')}
                                        </Badge>
                                    </div>

                                    <div className="mt-5 flex items-center justify-between gap-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setProgressProgram(program)}
                                        >
                                            <Users className="h-3.5 w-3.5" />
                                            {t('Avancement')}
                                        </Button>
                                        <div className="flex items-center gap-1">
                                        <Button type="button" size="icon" variant="ghost" aria-label={t('Modifier')} onClick={() => openEditDialog(program)}>
                                            <Pencil />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label={program.is_active ? t('Désactiver') : t('Activer')}
                                            disabled={toggleMutation.isPending}
                                            onClick={() => toggleMutation.mutate(program)}
                                        >
                                            <Power />
                                        </Button>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>

            <ProgramDialog
                open={dialogOpen}
                editing={editing}
                form={form}
                setForm={setForm}
                error={formError}
                saving={saving}
                services={services}
                onClose={closeDialog}
                onSubmit={submit}
            />

            <ProgramProgressDialog
                program={progressProgram}
                onClose={() => setProgressProgram(null)}
            />
        </>
    );
}

/** §avancement — where every client stands on one program (7/10, 3/10…). */
function ProgramProgressDialog({ program, onClose }: { program: LoyaltyProgram | null; onClose: () => void }) {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const isAmount = program?.type === 'amount_spent';

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['loyalty-programs', program?.id, 'progress'],
        queryFn: () => getLoyaltyProgramProgress(program!.id),
        enabled: program !== null,
    });

    const rows = useMemo(() => {
        const all = data?.data ?? [];
        const term = search.trim().toLowerCase();
        if (!term) return all;
        return all.filter(
            (row) =>
                (row.client_name ?? '').toLowerCase().includes(term) ||
                (row.client_phone ?? '').replace(/\D/g, '').includes(term.replace(/\D/g, '') || ' '),
        );
    }, [data, search]);

    const formatValue = (value: number) =>
        isAmount ? formatCurrency(value, { maximumFractionDigits: 0 }) : String(value);

    return (
        <Dialog open={program !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('Avancement des clients')}</DialogTitle>
                    <DialogDescription>{program?.name}</DialogDescription>
                </DialogHeader>

                {isPending ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-14 w-full rounded-md" />
                        ))}
                    </div>
                ) : isError ? (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {getErrorMessage(error)}
                    </div>
                ) : !data || data.data.length === 0 ? (
                    <div className="space-y-3">
                        <EmptyState
                            icon={Users}
                            title={t('Aucun client engagé')}
                            description={t("Dès qu'un client cumule sur ce programme, il apparaît ici.")}
                        />
                        <p className="rounded-md border border-accent/20 bg-accent/[0.05] px-3.5 py-2.5 text-xs text-muted-foreground">
                            {t("Le cumul se fait automatiquement à l'encaissement, à trois conditions : le ticket est lié à un")}{' '}
                            <span className="font-medium text-foreground">{t('client fiché')}</span>{' '}
                            {t('(un client de passage ne cumule jamais), la vente correspond aux')}{' '}
                            <span className="font-medium text-foreground">{t('services/catégorie du programme')}</span>
                            {t(', et la vente est postérieure à la création du programme.')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5" />
                                {data.meta.participants} {data.meta.participants > 1 ? t('clients') : t('client')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Trophy className="h-3.5 w-3.5 text-accent" />
                                {data.meta.rewards_total}{' '}
                                {data.meta.rewards_total > 1 ? t('récompenses gagnées') : t('récompense gagnée')}
                            </span>
                        </div>

                        {data.data.length > 5 && (
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder={t('Filtrer par nom ou téléphone...')}
                                    className="h-9 pl-9"
                                />
                            </div>
                        )}

                        <ul className="space-y-2">
                            {rows.map((row) => (
                                <li
                                    key={row.client_id}
                                    className="rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2.5"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint/[0.06] text-xs font-semibold text-accent ring-1 ring-tint/10">
                                                {getInitials(row.client_name ?? '?')}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {row.client_name ?? t('Client supprimé')}
                                                </span>
                                                {row.client_phone && (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Phone className="h-3 w-3" />
                                                        {row.client_phone}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className="block text-sm font-semibold tabular-nums text-foreground">
                                                {formatValue(row.current)}
                                                {row.threshold !== null && (
                                                    <span className="text-muted-foreground"> / {formatValue(row.threshold)}</span>
                                                )}
                                            </span>
                                            {row.rewards_earned > 0 && (
                                                <span className="flex items-center justify-end gap-1 text-[11px] text-accent">
                                                    <Trophy className="h-3 w-3" />
                                                    {row.rewards_earned} {row.rewards_earned > 1 ? t('gagnées') : t('gagnée')}
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    {row.percent !== null && (
                                        <div className="mt-2">
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-tint/[0.08]">
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full transition-all',
                                                        row.percent >= 100 ? 'bg-success' : 'bg-accent',
                                                    )}
                                                    style={{ width: `${Math.max(4, row.percent)}%` }}
                                                />
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                                <span>{row.percent}%</span>
                                                <span>
                                                    {row.percent >= 100
                                                        ? t('Objectif atteint')
                                                        : t('Encore {n}', { n: formatValue(row.remaining ?? 0) })}
                                                    {row.last_activity_at
                                                        ? ` · ${formatRelativeTime(row.last_activity_at)}`
                                                        : ''}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                            {rows.length === 0 && (
                                <p className="rounded-md border border-dashed border-tint/[0.1] px-3 py-5 text-center text-xs text-muted-foreground">
                                    {t('Aucun client ne correspond à ce filtre.')}
                                </p>
                            )}
                        </ul>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function ProgramDialog({
    open,
    editing,
    form,
    setForm,
    error,
    saving,
    services,
    onClose,
    onSubmit,
}: {
    open: boolean;
    editing: LoyaltyProgram | null;
    form: FormState;
    setForm: Dispatch<SetStateAction<FormState>>;
    error: string | null;
    saving: boolean;
    services: Array<{ id: number; name: string; category?: string }>;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const { t } = useI18n();
    const isRuleType = RULE_TYPES.includes(form.type);
    const hasReward = form.type !== 'custom';

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editing ? t('Modifier le programme') : t('Nouveau programme de fidélité')}</DialogTitle>
                    <DialogDescription>
                        {t('Le client cumule sur son compte fidélité numérique — jamais une carte physique.')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="program-name">{t('Nom')}</Label>
                            <Input
                                id="program-name"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder={t('5 Hammams = 1 Gratuit')}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="program-type">{t('Type')}</Label>
                            <select
                                id="program-type"
                                value={form.type}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, type: event.target.value as LoyaltyProgramType }))
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {t(label)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="program-description">{t('Description')}</Label>
                        <Input
                            id="program-description"
                            value={form.description}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder={t('Après 5 hammams payés, le client reçoit un hammam gratuit.')}
                        />
                    </div>

                    {isRuleType && (
                        <div className="space-y-4 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Règle d'accumulation")}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('Quelles ventes encaissées font avancer le compteur du client — à ne pas confondre avec la récompense offerte, définie plus bas.')}
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="program-category">{t('Catégorie ciblée (optionnel)')}</Label>
                                    <select
                                        id="program-category"
                                        value={form.category}
                                        onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                                        className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="">{t('Toutes les catégories')}</option>
                                        {CATEGORIES.map((category) => (
                                            <option key={category.value} value={category.value}>
                                                {t(category.label)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="program-service">{t('Service ciblé (optionnel)')}</Label>
                                    <select
                                        id="program-service"
                                        value={form.service_id}
                                        onChange={(event) => setForm((current) => ({ ...current, service_id: event.target.value }))}
                                        className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="">{t('Tous les services de la catégorie')}</option>
                                        {services.map((service) => (
                                            <option key={service.id} value={service.id}>
                                                {service.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {(() => {
                                    const targeted = services.find((service) => String(service.id) === form.service_id);
                                    if (!form.category || !targeted?.category || targeted.category === form.category) {
                                        return null;
                                    }
                                    return (
                                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive sm:col-span-2">
                                            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                                            <span>
                                                {t("Le service « {service} » appartient à la catégorie « {catService} », pas « {cat} » — aucune vente ne pourrait jamais correspondre. Retirez l'un des deux filtres.", { service: targeted.name, catService: targeted.category, cat: form.category })}
                                            </span>
                                        </div>
                                    );
                                })()}
                                {form.type === 'points' && (
                                    <Field
                                        id="program-points-per-mad"
                                        label={t('Points par MAD dépensé')}
                                        value={form.points_per_mad}
                                        onChange={(value) => setForm((current) => ({ ...current, points_per_mad: value }))}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                    />
                                )}
                                <Field
                                    id="program-threshold"
                                    label={form.type === 'points' ? t('Seuil (points)') : form.type === 'amount_spent' ? t('Seuil (MAD)') : t('Seuil (nombre)')}
                                    value={form.threshold}
                                    onChange={(value) => setForm((current) => ({ ...current, threshold: value }))}
                                    type="number"
                                    step="1"
                                    min="1"
                                />
                                <Field
                                    id="program-expiry"
                                    label={t('Expiration récompense (jours, optionnel)')}
                                    value={form.reward_expires_after_days}
                                    onChange={(value) => setForm((current) => ({ ...current, reward_expires_after_days: value }))}
                                    type="number"
                                    step="1"
                                    min="0"
                                    required={false}
                                />
                            </div>
                            <label className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
                                <input
                                    type="checkbox"
                                    checked={form.rollover_surplus}
                                    onChange={(event) => setForm((current) => ({ ...current, rollover_surplus: event.target.checked }))}
                                    className="h-4 w-4 accent-accent"
                                />
                                <span className="text-sm font-medium text-foreground">
                                    {t('Reporter le surplus au-delà du seuil (sinon il est perdu)')}
                                </span>
                            </label>
                        </div>
                    )}

                    {form.type === 'custom' && (
                        <div className="space-y-2">
                            <Label htmlFor="program-conditions">{t('Conditions (JSON, toutes requises)')}</Label>
                            <textarea
                                id="program-conditions"
                                value={form.conditions_json}
                                onChange={(event) => setForm((current) => ({ ...current, conditions_json: event.target.value }))}
                                rows={4}
                                className="flex w-full rounded-md border border-input bg-tint/[0.03] px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent/60"
                                placeholder='[{"metric":"total_spent_gte","value":1000}]'
                            />
                            <p className="text-xs text-muted-foreground">
                                {t('Métriques disponibles : total_spent_gte, visits_gte, days_since_last_visit_gte, has_active_subscription.')}
                            </p>
                        </div>
                    )}

                    {hasReward && (
                        <div className="space-y-4 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Récompense générée')}</p>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="reward-type">{t('Type de récompense')}</Label>
                                    <select
                                        id="reward-type"
                                        value={form.reward_type}
                                        onChange={(event) =>
                                            setForm((current) => ({ ...current, reward_type: event.target.value as FormState['reward_type'] }))
                                        }
                                        className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="service">{t('Service gratuit')}</option>
                                        <option value="discount_percent">{t('Réduction en %')}</option>
                                        <option value="discount_amount">{t('Réduction en MAD')}</option>
                                    </select>
                                </div>
                                {form.reward_type === 'service' ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="reward-service">{t('Service offert')}</Label>
                                        <select
                                            id="reward-service"
                                            value={form.reward_service_id}
                                            onChange={(event) => setForm((current) => ({ ...current, reward_service_id: event.target.value }))}
                                            className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                                        >
                                            <option value="">{t('Choisir un service')}</option>
                                            {services.map((service) => (
                                                <option key={service.id} value={service.id}>
                                                    {service.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <Field
                                        id="reward-value"
                                        label={form.reward_type === 'discount_percent' ? t('Valeur (%)') : t('Valeur (MAD)')}
                                        value={form.reward_value}
                                        onChange={(value) => setForm((current) => ({ ...current, reward_value: value }))}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="commission-basis">{t('Commission sur ligne gratuite')}</Label>
                            <select
                                id="commission-basis"
                                value={form.commission_basis}
                                onChange={(event) => setForm((current) => ({ ...current, commission_basis: event.target.value as CommissionBasis }))}
                                className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                                <option value="none">{t('Aucune')}</option>
                                <option value="public_price">{t('Prix public')}</option>
                                <option value="internal_value">{t('Valeur interne')}</option>
                                <option value="fixed">{t('Montant fixe')}</option>
                                <option value="percent">{t('Pourcentage du prix public')}</option>
                            </select>
                        </div>
                        {(form.commission_basis === 'fixed' || form.commission_basis === 'percent') && (
                            <Field
                                id="commission-value"
                                label={form.commission_basis === 'fixed' ? t('Montant (MAD)') : t('Pourcentage (%)')}
                                value={form.commission_value}
                                onChange={(value) => setForm((current) => ({ ...current, commission_value: value }))}
                                type="number"
                                step="0.01"
                                min="0"
                            />
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="program-starts">{t('Début (optionnel)')}</Label>
                            <Input
                                id="program-starts"
                                type="date"
                                value={form.starts_on}
                                onChange={(event) => setForm((current) => ({ ...current, starts_on: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="program-ends">{t('Fin (optionnel)')}</Label>
                            <Input
                                id="program-ends"
                                type="date"
                                value={form.ends_on}
                                onChange={(event) => setForm((current) => ({ ...current, ends_on: event.target.value }))}
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                            className="h-4 w-4 accent-accent"
                        />
                        <span className="text-sm font-medium text-foreground">{t('Programme actif')}</span>
                    </label>

                    <FormError error={error} />

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('Annuler')}
                        </Button>
                        <Button type="submit" variant="accent" disabled={saving}>
                            {saving && <Loader2 className="animate-spin" />}
                            {editing ? t('Enregistrer') : t('Créer')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' }) {
    return (
        <Card className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone === 'success' ? 'text-success' : 'text-foreground')}>{value}</p>
        </Card>
    );
}

function LoadingGrid() {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="p-5">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="mt-3 h-4 w-1/2" />
                    <Skeleton className="mt-5 h-10 w-full" />
                </Card>
            ))}
        </div>
    );
}

function ErrorCard({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
    const { t } = useI18n();
    return (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                <AlertCircle className="h-5 w-5 text-destructive" />
            </span>
            <h2 className="mt-4 text-base font-semibold">{title}</h2>
            <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">{message}</p>
            <Button variant="accent" className="mt-6" onClick={onRetry}>
                {t('Réessayer')}
            </Button>
        </Card>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    type = 'text',
    step,
    min,
    placeholder,
    required = true,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    step?: string;
    min?: string;
    placeholder?: string;
    required?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                step={step}
                min={min}
                inputMode={type === 'number' ? 'decimal' : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                required={required}
            />
        </div>
    );
}

function FormError({ error }: { error: string | null }) {
    if (!error) return null;

    return (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
        </div>
    );
}
