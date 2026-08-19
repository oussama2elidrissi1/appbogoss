import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Partner, PartnerCommissionType, PartnerPayload, Service } from '@/types/workday';
import { getCategoryLabel } from '@/components/workday/categories';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface CommissionDraft {
    enabled: boolean;
    type: PartnerCommissionType;
    value: string;
}

interface PartnerFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = creation mode. */
    partner: Partner | null;
    services: Service[];
    saving: boolean;
    error: unknown;
    onSubmit: (payload: PartnerPayload) => void;
}

const emptyForm = {
    name: '',
    trade_name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    login_email: '',
    login_password: '',
};

/**
 * Create/edit a partner account: identity + login credentials + the per-service
 * commission grid (fixed amount or percentage), all defined in one place.
 */
export function PartnerFormDialog({
    open,
    onOpenChange,
    partner,
    services,
    saving,
    error,
    onSubmit,
}: PartnerFormDialogProps) {
    const [form, setForm] = useState(emptyForm);
    const [commissions, setCommissions] = useState<Record<number, CommissionDraft>>({});

    useEffect(() => {
        if (!open) return;

        if (partner) {
            setForm({
                name: partner.name,
                trade_name: partner.trade_name ?? '',
                contact_name: partner.contact_name ?? '',
                phone: partner.phone ?? '',
                email: partner.email ?? '',
                address: partner.address ?? '',
                notes: partner.notes ?? '',
                login_email: partner.login_email ?? '',
                login_password: '',
            });
            const drafts: Record<number, CommissionDraft> = {};
            (partner.commissions ?? []).forEach((rule) => {
                drafts[rule.service_id] = {
                    enabled: true,
                    type: rule.type,
                    value: String(rule.value),
                };
            });
            setCommissions(drafts);
        } else {
            setForm(emptyForm);
            setCommissions({});
        }
    }, [open, partner]);

    const servicesByCategory = useMemo(() => {
        const groups = new Map<string, Service[]>();
        services
            .filter((service) => service.is_active)
            .forEach((service) => {
                const list = groups.get(service.category) ?? [];
                list.push(service);
                groups.set(service.category, list);
            });
        return [...groups.entries()];
    }, [services]);

    const enabledCount = Object.values(commissions).filter((draft) => draft.enabled).length;

    function draftOf(serviceId: number): CommissionDraft {
        return commissions[serviceId] ?? { enabled: false, type: 'percentage', value: '' };
    }

    function toggleService(serviceId: number) {
        setCommissions((current) => {
            const draft = draftOf(serviceId);
            return { ...current, [serviceId]: { ...draft, enabled: !draft.enabled } };
        });
    }

    function updateDraft(serviceId: number, patch: Partial<CommissionDraft>) {
        setCommissions((current) => ({
            ...current,
            [serviceId]: { ...draftOf(serviceId), ...patch, enabled: true },
        }));
    }

    const canSubmit =
        form.name.trim().length >= 2 &&
        form.login_email.trim().length > 3 &&
        Object.values(commissions).every(
            (draft) => !draft.enabled || (draft.value !== '' && Number(draft.value) >= 0),
        );

    function submit() {
        if (!canSubmit || saving) return;

        const payload: PartnerPayload = {
            name: form.name.trim(),
            trade_name: form.trade_name.trim() || null,
            contact_name: form.contact_name.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
            notes: form.notes.trim() || null,
            login_email: form.login_email.trim(),
            ...(form.login_password.trim() ? { login_password: form.login_password.trim() } : {}),
            commissions: Object.entries(commissions)
                .filter(([, draft]) => draft.enabled && draft.value !== '')
                .map(([serviceId, draft]) => ({
                    service_id: Number(serviceId),
                    type: draft.type,
                    value: Number(draft.value),
                })),
        };

        onSubmit(payload);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{partner ? 'Modifier le partenaire' : 'Nouveau partenaire'}</DialogTitle>
                    <DialogDescription>
                        Le partenaire pourra se connecter et créer des réservations dans votre agenda. Sa
                        commission est définie service par service — montant fixe ou pourcentage du prix.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Nom du partenaire *">
                            <Input
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="Hôtel Atlas, Riad Yasmine..."
                            />
                        </Field>
                        <Field label="Nom commercial">
                            <Input
                                value={form.trade_name}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, trade_name: event.target.value }))
                                }
                                placeholder="Nom affiché sur l'espace partenaire"
                            />
                        </Field>
                        <Field label="Personne de contact">
                            <Input
                                value={form.contact_name}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, contact_name: event.target.value }))
                                }
                                placeholder="Nom du contact"
                            />
                        </Field>
                        <Field label="Téléphone">
                            <Input
                                value={form.phone}
                                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                                placeholder="06 XX XX XX XX"
                            />
                        </Field>
                        <Field label="Email de contact">
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                placeholder="contact@partenaire.com"
                            />
                        </Field>
                    </div>

                    <Field label="Adresse">
                        <Input
                            value={form.address}
                            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                            placeholder="Adresse de l'établissement"
                        />
                    </Field>

                    <div className="rounded-md border border-tint/[0.08] bg-tint/[0.02] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Compte de connexion
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Email de connexion *">
                                <Input
                                    type="email"
                                    value={form.login_email}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, login_email: event.target.value }))
                                    }
                                    placeholder="partenaire@bogosland.com"
                                />
                            </Field>
                            <Field label={partner ? 'Nouveau mot de passe' : 'Mot de passe'}>
                                <Input
                                    type="password"
                                    value={form.login_password}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, login_password: event.target.value }))
                                    }
                                    placeholder={
                                        partner ? 'Laisser vide pour ne pas changer' : 'Vide = généré automatiquement'
                                    }
                                />
                            </Field>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Commissions par service
                            </p>
                            <span className="text-xs text-muted-foreground">
                                {enabledCount} service{enabledCount > 1 ? 's' : ''} commissionné
                                {enabledCount > 1 ? 's' : ''}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Activez les services que ce partenaire peut apporter et fixez sa rémunération —
                            en % du prix ou en montant fixe (MAD).
                        </p>

                        <div className="mt-3 max-h-72 space-y-4 overflow-y-auto pr-1">
                            {servicesByCategory.map(([category, categoryServices]) => (
                                <div key={category}>
                                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                                        {getCategoryLabel(category)}
                                    </p>
                                    <div className="space-y-1.5">
                                        {categoryServices.map((service) => {
                                            const draft = draftOf(service.id);
                                            return (
                                                <div
                                                    key={service.id}
                                                    className={cn(
                                                        'flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 transition-colors',
                                                        draft.enabled
                                                            ? 'border-accent/40 bg-accent/[0.06]'
                                                            : 'border-tint/[0.08] bg-tint/[0.02]',
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleService(service.id)}
                                                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
                                                                draft.enabled
                                                                    ? 'border-accent bg-accent text-accent-foreground'
                                                                    : 'border-tint/[0.2]',
                                                            )}
                                                        >
                                                            {draft.enabled ? '✓' : ''}
                                                        </span>
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium text-foreground">
                                                                {service.name}
                                                            </span>
                                                            <span className="block text-xs text-muted-foreground">
                                                                {formatCurrency(service.price, {
                                                                    maximumFractionDigits: 2,
                                                                })}
                                                            </span>
                                                        </span>
                                                    </button>

                                                    {draft.enabled && (
                                                        <div className="flex shrink-0 items-center gap-1.5">
                                                            <div className="flex overflow-hidden rounded-md border border-tint/[0.1]">
                                                                {(
                                                                    [
                                                                        ['percentage', '%'],
                                                                        ['fixed', 'MAD'],
                                                                    ] as Array<[PartnerCommissionType, string]>
                                                                ).map(([type, label]) => (
                                                                    <button
                                                                        key={type}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            updateDraft(service.id, { type })
                                                                        }
                                                                        className={cn(
                                                                            'px-2.5 py-1.5 text-xs font-semibold transition-colors',
                                                                            draft.type === type
                                                                                ? 'bg-accent text-accent-foreground'
                                                                                : 'text-muted-foreground hover:text-foreground',
                                                                        )}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                step="0.5"
                                                                value={draft.value}
                                                                onChange={(event) =>
                                                                    updateDraft(service.id, {
                                                                        value: event.target.value,
                                                                    })
                                                                }
                                                                placeholder={draft.type === 'percentage' ? '10' : '50'}
                                                                className="h-9 w-24 text-right"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Field label="Notes">
                        <textarea
                            value={form.notes}
                            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Conditions particulières, mode de règlement des commissions..."
                            className={cn(
                                'flex min-h-20 w-full resize-y rounded-md border border-input bg-tint/[0.03] px-3.5 py-3 text-sm text-foreground shadow-sm transition-all duration-200',
                                'focus-visible:border-accent/60 focus-visible:bg-tint/[0.05] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10',
                            )}
                        />
                    </Field>

                    {error != null && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(error)}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Annuler
                    </Button>
                    <Button type="button" variant="accent" disabled={!canSubmit || saving} onClick={submit}>
                        {saving && <Loader2 className="animate-spin" />}
                        {partner ? 'Enregistrer' : 'Créer le partenaire'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
            <div className="mt-2">{children}</div>
        </label>
    );
}
