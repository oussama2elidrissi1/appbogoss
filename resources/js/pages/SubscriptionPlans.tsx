import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarClock, Loader2, Pencil, Plus, Power, ShoppingBag, Trash2 } from 'lucide-react';
import {
    createSubscriptionPlan,
    deactivateSubscriptionPlan,
    getErrorMessage,
    getServices,
    getSubscriptionPlans,
    purchaseSubscription,
    updateSubscriptionPlan,
} from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type {
    CommissionBasis,
    SubscriptionPlan,
    SubscriptionPlanPayload,
    SubscriptionPlanServicePayload,
} from '@/types/loyalty';
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
import { ClientPicker, EMPTY_CLIENT_SELECTION, type ClientSelection } from '@/components/workday/ClientPicker';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

const DURATION_LABELS: Record<string, string> = { days: 'jour(s)', weeks: 'semaine(s)', months: 'mois' };
const QUOTA_PERIOD_LABELS: Record<string, string> = { day: 'jour', week: 'semaine', month: 'mois' };

type ServiceRowForm = {
    key: string;
    service_id: string;
    quota_period: '' | 'day' | 'week' | 'month';
    quota_per_period: string;
    quota_total: string;
    allow_rollover: boolean;
    commission_basis: CommissionBasis;
    commission_value: string;
};

function emptyServiceRow(): ServiceRowForm {
    return {
        key: Math.random().toString(36).slice(2),
        service_id: '',
        quota_period: 'week',
        quota_per_period: '1',
        quota_total: '',
        allow_rollover: false,
        commission_basis: 'public_price',
        commission_value: '',
    };
}

const emptyForm = {
    name: '',
    description: '',
    price: '',
    duration_value: '3',
    duration_unit: 'months' as 'days' | 'weeks' | 'months',
    is_active: true,
    allow_suspension: false,
    allow_renewal: true,
    notes: '',
    allowed_days: [] as number[],
    time_start: '',
    time_end: '',
    max_per_day: '',
    max_per_week: '',
    max_per_month: '',
    min_interval_minutes: '',
    services: [emptyServiceRow()],
};

type FormState = typeof emptyForm;

function planToForm(plan: SubscriptionPlan): FormState {
    return {
        name: plan.name,
        description: plan.description ?? '',
        price: String(plan.price),
        duration_value: String(plan.duration_value),
        duration_unit: plan.duration_unit,
        is_active: plan.is_active,
        allow_suspension: plan.allow_suspension ?? false,
        allow_renewal: plan.allow_renewal ?? true,
        notes: plan.notes ?? '',
        allowed_days: plan.allowed_days ?? [],
        time_start: plan.time_start ?? '',
        time_end: plan.time_end ?? '',
        max_per_day: plan.max_per_day != null ? String(plan.max_per_day) : '',
        max_per_week: plan.max_per_week != null ? String(plan.max_per_week) : '',
        max_per_month: plan.max_per_month != null ? String(plan.max_per_month) : '',
        min_interval_minutes: plan.min_interval_minutes != null ? String(plan.min_interval_minutes) : '',
        services: plan.services.length
            ? plan.services.map((service) => ({
                  key: Math.random().toString(36).slice(2),
                  service_id: String(service.service_id),
                  quota_period: (service.quota_period ?? '') as ServiceRowForm['quota_period'],
                  quota_per_period: service.quota_per_period != null ? String(service.quota_per_period) : '',
                  quota_total: service.quota_total != null ? String(service.quota_total) : '',
                  allow_rollover: service.allow_rollover,
                  commission_basis: service.commission_basis ?? 'none',
                  commission_value: service.commission_value != null ? String(service.commission_value) : '',
              }))
            : [emptyServiceRow()],
    };
}

function formToPayload(form: FormState): SubscriptionPlanPayload {
    const services: SubscriptionPlanServicePayload[] = form.services
        .filter((row) => row.service_id)
        .map((row) => ({
            service_id: Number(row.service_id),
            quota_period: row.quota_period || null,
            quota_per_period: row.quota_per_period.trim() ? Number(row.quota_per_period) : null,
            quota_total: row.quota_total.trim() ? Number(row.quota_total) : null,
            allow_rollover: row.allow_rollover,
            commission_basis: row.commission_basis,
            commission_value: row.commission_value.trim() ? Number(row.commission_value) : null,
        }));

    return {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price || 0),
        duration_value: Number(form.duration_value || 0),
        duration_unit: form.duration_unit,
        is_active: form.is_active,
        allow_suspension: form.allow_suspension,
        allow_renewal: form.allow_renewal,
        notes: form.notes.trim() || null,
        allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
        max_per_day: form.max_per_day.trim() ? Number(form.max_per_day) : null,
        max_per_week: form.max_per_week.trim() ? Number(form.max_per_week) : null,
        max_per_month: form.max_per_month.trim() ? Number(form.max_per_month) : null,
        min_interval_minutes: form.min_interval_minutes.trim() ? Number(form.min_interval_minutes) : null,
        services,
    };
}

const DAY_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Jeu' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sam' },
    { value: 7, label: 'Dim' },
];

export default function SubscriptionPlans() {
    const { t } = useI18n();
    const queryClient = useQueryClient();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [sellingPlan, setSellingPlan] = useState<SubscriptionPlan | null>(null);

    const plansQuery = useQuery({ queryKey: ['subscription-plans'], queryFn: getSubscriptionPlans });
    const servicesQuery = useQuery({ queryKey: ['services', 'all-for-loyalty'], queryFn: () => getServices() });

    const plans = plansQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    const activeCount = useMemo(() => plans.filter((plan) => plan.is_active).length, [plans]);

    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });

    const createMutation = useMutation({
        mutationFn: createSubscriptionPlan,
        onSuccess: () => {
            refresh();
            closeDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: SubscriptionPlanPayload }) => updateSubscriptionPlan(id, payload),
        onSuccess: () => {
            refresh();
            closeDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const toggleMutation = useMutation({
        mutationFn: (plan: SubscriptionPlan) =>
            plan.is_active
                ? deactivateSubscriptionPlan(plan.id)
                : updateSubscriptionPlan(plan.id, { ...formToPayload(planToForm(plan)), is_active: true }),
        onSuccess: refresh,
    });

    function openCreateDialog() {
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
        setDialogOpen(true);
    }

    function openEditDialog(plan: SubscriptionPlan) {
        setEditing(plan);
        setForm(planToForm(plan));
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
        if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) {
            setFormError(t('Le prix doit être valide.'));
            return;
        }
        if (!form.services.some((row) => row.service_id)) {
            setFormError(t('Ajoutez au moins un service inclus.'));
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
                        <h2 className="text-2xl font-semibold tracking-tight">{t('Abonnements')}</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {t('Plans payants avec quotas de services inclus, ex. « Hammam 3 mois ».')}
                        </p>
                    </div>
                    <Button variant="accent" onClick={openCreateDialog}>
                        <Plus />
                        {t('Nouveau plan')}
                    </Button>
                </motion.div>

                <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Stat label={t('Plans')} value={plans.length} />
                    <Stat label={t('Actifs')} value={activeCount} tone="success" />
                </motion.div>

                {plansQuery.isError ? (
                    <ErrorCard
                        title={t('Impossible de charger les plans')}
                        message={getErrorMessage(plansQuery.error)}
                        onRetry={() => void plansQuery.refetch()}
                    />
                ) : plansQuery.isPending ? (
                    <LoadingGrid />
                ) : plans.length === 0 ? (
                    <EmptyState
                        icon={CalendarClock}
                        title={t("Aucun plan d'abonnement")}
                        description={t('Créez un plan, par exemple « Hammam 3 mois » (1 hammam/semaine).')}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {plans.map((plan) => (
                            <motion.div key={plan.id} variants={item} layout>
                                <Card className={cn('p-5', !plan.is_active && 'opacity-75')}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-semibold text-foreground">{plan.name}</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {plan.duration_value} {t(DURATION_LABELS[plan.duration_unit])}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                            {formatCurrency(plan.price, { maximumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Badge variant={plan.is_active ? 'success' : 'outline'}>{plan.is_active ? t('Actif') : t('Inactif')}</Badge>
                                        {plan.services.map((service) => (
                                            <Badge key={service.id} variant="outline">
                                                {service.service_name}
                                                {service.quota_period && service.quota_per_period
                                                    ? ` · ${service.quota_per_period}/${t(QUOTA_PERIOD_LABELS[service.quota_period])}`
                                                    : ''}
                                            </Badge>
                                        ))}
                                    </div>

                                    <div className="mt-5 flex items-center justify-between gap-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={!plan.is_active}
                                            onClick={() => setSellingPlan(plan)}
                                        >
                                            <ShoppingBag className="h-3.5 w-3.5" />
                                            {t('Vendre')}
                                        </Button>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" size="icon" variant="ghost" aria-label={t('Modifier')} onClick={() => openEditDialog(plan)}>
                                                <Pencil />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label={plan.is_active ? t('Désactiver') : t('Activer')}
                                                disabled={toggleMutation.isPending}
                                                onClick={() => toggleMutation.mutate(plan)}
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

            <PlanDialog
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

            <SellSubscriptionDialog plan={sellingPlan} onClose={() => setSellingPlan(null)} />
        </>
    );
}

function PlanDialog({
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
    editing: SubscriptionPlan | null;
    form: FormState;
    setForm: Dispatch<SetStateAction<FormState>>;
    error: string | null;
    saving: boolean;
    services: Array<{ id: number; name: string }>;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    const { t } = useI18n();

    function updateRow(key: string, patch: Partial<ServiceRowForm>) {
        setForm((current) => ({
            ...current,
            services: current.services.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        }));
    }

    function addRow() {
        setForm((current) => ({ ...current, services: [...current.services, emptyServiceRow()] }));
    }

    function removeRow(key: string) {
        setForm((current) => ({ ...current, services: current.services.filter((row) => row.key !== key) }));
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editing ? t('Modifier le plan') : t('Nouveau plan d’abonnement')}</DialogTitle>
                    <DialogDescription>{t('Le client achète le plan une fois, puis consomme les services inclus selon leur quota.')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="plan-name">{t('Nom')}</Label>
                        <Input
                            id="plan-name"
                            value={form.name}
                            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder={t('Hammam 3 mois')}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="plan-description">{t('Description')}</Label>
                        <Input
                            id="plan-description"
                            value={form.description}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder={t('1 hammam par semaine pendant 3 mois.')}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field
                            id="plan-price"
                            label={t('Prix MAD')}
                            value={form.price}
                            onChange={(value) => setForm((current) => ({ ...current, price: value }))}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="1000"
                        />
                        <Field
                            id="plan-duration-value"
                            label={t('Durée')}
                            value={form.duration_value}
                            onChange={(value) => setForm((current) => ({ ...current, duration_value: value }))}
                            type="number"
                            step="1"
                            min="1"
                        />
                        <div className="space-y-2">
                            <Label htmlFor="plan-duration-unit">{t('Unité')}</Label>
                            <select
                                id="plan-duration-unit"
                                value={form.duration_unit}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, duration_unit: event.target.value as FormState['duration_unit'] }))
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                                <option value="days">{t('Jours')}</option>
                                <option value="weeks">{t('Semaines')}</option>
                                <option value="months">{t('Mois')}</option>
                            </select>
                        </div>
                    </div>

                    {/* ------------------------------------------------ usage rules */}
                    <div className="space-y-4 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("Règles d'utilisation")}
                            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/70">
                                {t('— tout est optionnel, vide = aucune restriction')}
                            </span>
                        </p>

                        <div>
                            <Label>{t('Jours autorisés')}</Label>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {DAY_OPTIONS.map((day) => {
                                    const selected = form.allowed_days.includes(day.value);
                                    return (
                                        <button
                                            key={day.value}
                                            type="button"
                                            onClick={() =>
                                                setForm((current) => ({
                                                    ...current,
                                                    allowed_days: selected
                                                        ? current.allowed_days.filter((value) => value !== day.value)
                                                        : [...current.allowed_days, day.value].sort((a, b) => a - b),
                                                }))
                                            }
                                            className={cn(
                                                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                                selected
                                                    ? 'border-accent/60 bg-accent/[0.14] text-foreground'
                                                    : 'border-tint/[0.08] bg-tint/[0.02] text-muted-foreground hover:border-accent/30',
                                            )}
                                        >
                                            {t(day.label)}
                                        </button>
                                    );
                                })}
                            </div>
                            {form.allowed_days.length === 0 && (
                                <p className="mt-1.5 text-[11px] text-muted-foreground/70">{t('Aucun jour coché = valable tous les jours.')}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="plan-time-start">{t('Heure début')}</Label>
                                <Input
                                    id="plan-time-start"
                                    type="time"
                                    value={form.time_start}
                                    onChange={(event) => setForm((current) => ({ ...current, time_start: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="plan-time-end">{t('Heure fin')}</Label>
                                <Input
                                    id="plan-time-end"
                                    type="time"
                                    value={form.time_end}
                                    onChange={(event) => setForm((current) => ({ ...current, time_end: event.target.value }))}
                                />
                            </div>
                            <Field
                                id="plan-max-day"
                                label={t('Max / jour')}
                                value={form.max_per_day}
                                onChange={(value) => setForm((current) => ({ ...current, max_per_day: value }))}
                                type="number"
                                min="1"
                                placeholder="∞"
                            />
                            <Field
                                id="plan-max-week"
                                label={t('Max / semaine')}
                                value={form.max_per_week}
                                onChange={(value) => setForm((current) => ({ ...current, max_per_week: value }))}
                                type="number"
                                min="1"
                                placeholder="∞"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Field
                                id="plan-max-month"
                                label={t('Max / mois')}
                                value={form.max_per_month}
                                onChange={(value) => setForm((current) => ({ ...current, max_per_month: value }))}
                                type="number"
                                min="1"
                                placeholder="∞"
                            />
                            <Field
                                id="plan-min-interval"
                                label={t('Intervalle min. (minutes)')}
                                value={form.min_interval_minutes}
                                onChange={(value) => setForm((current) => ({ ...current, min_interval_minutes: value }))}
                                type="number"
                                min="5"
                                placeholder={t('ex. 360 = 6h')}
                            />
                            <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.allow_renewal}
                                    onChange={(event) => setForm((current) => ({ ...current, allow_renewal: event.target.checked }))}
                                    className="h-4 w-4 accent-[#C8A24C]"
                                />
                                {t('Renouvelable')}
                            </label>
                            <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.allow_suspension}
                                    onChange={(event) => setForm((current) => ({ ...current, allow_suspension: event.target.checked }))}
                                    className="h-4 w-4 accent-[#C8A24C]"
                                />
                                {t('Suspension autorisée')}
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Services inclus')}</p>
                            <Button type="button" size="sm" variant="outline" onClick={addRow}>
                                <Plus className="h-3.5 w-3.5" />
                                {t('Ajouter un service')}
                            </Button>
                        </div>

                        {form.services.map((row) => (
                            <div key={row.key} className="space-y-3 rounded-md border border-tint/[0.06] bg-background/40 p-3">
                                <div className="flex items-start gap-2">
                                    <select
                                        value={row.service_id}
                                        onChange={(event) => updateRow(row.key, { service_id: event.target.value })}
                                        className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="">{t('Choisir un service')}</option>
                                        {services.map((service) => (
                                            <option key={service.id} value={service.id}>
                                                {service.name}
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={t('Retirer')}
                                        onClick={() => removeRow(row.key)}
                                        disabled={form.services.length === 1}
                                    >
                                        <Trash2 className="text-destructive" />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <select
                                        value={row.quota_period}
                                        onChange={(event) => updateRow(row.key, { quota_period: event.target.value as ServiceRowForm['quota_period'] })}
                                        className="flex h-9 w-full rounded-md border border-input bg-tint/[0.03] px-2 text-xs text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="">{t('Sans quota périodique')}</option>
                                        <option value="day">{t('Par jour')}</option>
                                        <option value="week">{t('Par semaine')}</option>
                                        <option value="month">{t('Par mois')}</option>
                                    </select>
                                    <Input
                                        value={row.quota_per_period}
                                        onChange={(event) => updateRow(row.key, { quota_per_period: event.target.value })}
                                        type="number"
                                        min="1"
                                        placeholder={t('Qté / période')}
                                        className="h-9 text-xs"
                                        disabled={!row.quota_period}
                                    />
                                    <Input
                                        value={row.quota_total}
                                        onChange={(event) => updateRow(row.key, { quota_total: event.target.value })}
                                        type="number"
                                        min="1"
                                        placeholder={t('Quota total (optionnel)')}
                                        className="h-9 text-xs"
                                    />
                                    <select
                                        value={row.commission_basis}
                                        onChange={(event) => updateRow(row.key, { commission_basis: event.target.value as CommissionBasis })}
                                        className="flex h-9 w-full rounded-md border border-input bg-tint/[0.03] px-2 text-xs text-foreground outline-none focus:border-accent/60"
                                    >
                                        <option value="none">{t('Commission: aucune')}</option>
                                        <option value="public_price">{t('Commission: prix public')}</option>
                                        <option value="internal_value">{t('Commission: valeur interne')}</option>
                                        <option value="fixed">{t('Commission: montant fixe')}</option>
                                        <option value="percent">{t('Commission: %')}</option>
                                    </select>
                                </div>

                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={row.allow_rollover}
                                        onChange={(event) => updateRow(row.key, { allow_rollover: event.target.checked })}
                                        className="h-3.5 w-3.5 accent-accent"
                                    />
                                    {t('Reporter le quota non utilisé à la période suivante')}
                                </label>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="plan-notes">{t('Notes')}</Label>
                        <Input
                            id="plan-notes"
                            value={form.notes}
                            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        />
                    </div>

                    <label className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                            className="h-4 w-4 accent-accent"
                        />
                        <span className="text-sm font-medium text-foreground">{t('Plan actif')}</span>
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

function SellSubscriptionDialog({ plan, onClose }: { plan: SubscriptionPlan | null; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [clientSelection, setClientSelection] = useState<ClientSelection>(EMPTY_CLIENT_SELECTION);
    const [paymentMethod, setPaymentMethod] = useState('especes');
    const [error, setError] = useState<string | null>(null);

    const purchaseMutation = useMutation({
        mutationFn: () => {
            if (!plan || !clientSelection.client) throw new Error('Sélectionnez un client.');
            return purchaseSubscription(clientSelection.client.id, {
                subscription_plan_id: plan.id,
                payment_method: paymentMethod,
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['loyalty-status'] });
            handleClose();
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError)),
    });

    function handleClose() {
        setClientSelection(EMPTY_CLIENT_SELECTION);
        setPaymentMethod('especes');
        setError(null);
        onClose();
    }

    return (
        <Dialog open={plan !== null} onOpenChange={(nextOpen) => (nextOpen ? null : handleClose())}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Vendre « {plan?.name} »</DialogTitle>
                    <DialogDescription>
                        {plan ? `${formatCurrency(plan.price, { maximumFractionDigits: 2 })} — journée de caisse ouverte requise.` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <ClientPicker value={clientSelection} onChange={setClientSelection} />

                    <div className="space-y-2">
                        <Label htmlFor="sub-payment-method">Mode de paiement</Label>
                        <select
                            id="sub-payment-method"
                            value={paymentMethod}
                            onChange={(event) => setPaymentMethod(event.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                        >
                            <option value="especes">Espèces</option>
                            <option value="carte">Carte</option>
                            <option value="virement">Virement</option>
                            <option value="autre">Autre</option>
                        </select>
                    </div>

                    <FormError error={error} />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose}>
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant="accent"
                        disabled={!clientSelection.client || purchaseMutation.isPending}
                        onClick={() => purchaseMutation.mutate()}
                    >
                        {purchaseMutation.isPending && <Loader2 className="animate-spin" />}
                        Confirmer la vente
                    </Button>
                </DialogFooter>
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
    return (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                <AlertCircle className="h-5 w-5 text-destructive" />
            </span>
            <h2 className="mt-4 text-base font-semibold">{title}</h2>
            <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">{message}</p>
            <Button variant="accent" className="mt-6" onClick={onRetry}>
                Réessayer
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
