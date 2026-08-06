import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, getErrorMessage, getServices } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface CommissionRule {
    id: number;
    employee_id: number;
    service_id: number;
    service_name: string | null;
    type: 'percentage' | 'fixed';
    value: number;
    starts_on: string;
    ends_on: string | null;
    is_active: boolean;
}

async function getCommissionRules(employeeId: number): Promise<CommissionRule[]> {
    const { data } = await api.get<{ data: CommissionRule[] }>('/api/employee-service-commissions', {
        params: { employee_id: employeeId },
    });
    return data.data;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
    service_ids: [] as number[],
    type: 'percentage' as 'percentage' | 'fixed',
    value: '',
    starts_on: today(),
};

/** Per-employee, per-service commission rules — the priority override above the flat default rate. */
export function EmployeeCommissionRules({ employee }: { employee: Employee }) {
    const queryClient = useQueryClient();
    const [form, setForm] = useState(emptyForm);
    const [recalculatedCount, setRecalculatedCount] = useState<number | null>(null);

    const { data: rules, isPending } = useQuery({
        queryKey: ['commission-rules', employee.id],
        queryFn: () => getCommissionRules(employee.id),
    });

    const { data: services } = useQuery({
        queryKey: ['services', 'all', 'commission-picker'],
        queryFn: () => getServices({ includeInactive: false }),
        staleTime: 5 * 60_000,
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['commission-rules', employee.id] });
    }

    const createMutation = useMutation({
        mutationFn: () =>
            api.post<{ meta?: { recalculated_count?: number } }>('/api/employee-service-commissions', {
                employee_id: employee.id,
                service_ids: form.service_ids,
                type: form.type,
                value: Number(form.value),
                starts_on: form.starts_on,
            }),
        onSuccess: (response) => {
            invalidate();
            setForm(emptyForm);
            setRecalculatedCount(response.data.meta?.recalculated_count ?? 0);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => api.delete(`/api/employee-service-commissions/${id}`),
        onSuccess: invalidate,
    });

    const recalculateMutation = useMutation({
        mutationFn: (id: number) =>
            api.post<{ meta?: { recalculated_count?: number } }>(
                `/api/employee-service-commissions/${id}/recalculate`,
            ),
        onSuccess: (response) => {
            invalidate();
            setRecalculatedCount(response.data.meta?.recalculated_count ?? 0);
        },
    });

    const recalculateAllMutation = useMutation({
        mutationFn: () =>
            api.post<{ meta?: { recalculated_count?: number } }>(
                '/api/employee-service-commissions/recalculate-all',
                { employee_id: employee.id },
            ),
        onSuccess: (response) => {
            invalidate();
            setRecalculatedCount(response.data.meta?.recalculated_count ?? 0);
        },
    });

    function toggleService(serviceId: number) {
        setForm((current) => ({
            ...current,
            service_ids: current.service_ids.includes(serviceId)
                ? current.service_ids.filter((id) => id !== serviceId)
                : [...current.service_ids, serviceId],
        }));
    }

    const canSubmit = form.service_ids.length > 0 && form.value !== '' && Number(form.value) >= 0;
    const servicesById = new Map((services ?? []).map((service) => [service.id, service.name]));
    const serviceTriggerLabel =
        form.service_ids.length === 0
            ? 'Choisir…'
            : form.service_ids.length === 1
              ? (servicesById.get(form.service_ids[0]) ?? '1 service')
              : `${form.service_ids.length} services sélectionnés`;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Commissions par service
                </p>
                {!isPending && rules && rules.length > 0 && (
                    <button
                        type="button"
                        disabled={recalculateAllMutation.isPending}
                        onClick={() => {
                            setRecalculatedCount(null);
                            recalculateAllMutation.mutate();
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-tint/[0.08] px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:text-accent disabled:pointer-events-none disabled:opacity-60"
                        title="Recalculer l'historique de toutes les règles de cet employé"
                    >
                        <RefreshCw className={cn('h-3 w-3', recalculateAllMutation.isPending && 'animate-spin')} />
                        Tout recalculer
                    </button>
                )}
            </div>

            {isPending ? (
                <Skeleton className="h-10 w-full" />
            ) : rules && rules.length > 0 ? (
                <ul className="space-y-1.5">
                    {rules.map((rule) => (
                        <li
                            key={rule.id}
                            className={cn(
                                'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs',
                                rule.is_active
                                    ? 'border-accent/20 bg-accent/[0.05]'
                                    : 'border-tint/[0.06] text-muted-foreground opacity-60',
                            )}
                        >
                            <span className="min-w-0 truncate">
                                {rule.service_name} —{' '}
                                {rule.type === 'percentage' ? `${rule.value}%` : formatCurrency(rule.value)}
                                <span className="text-muted-foreground"> depuis {formatDate(rule.starts_on)}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    aria-label="Recalculer l'historique avec cette règle"
                                    title="Recalculer l'historique avec cette règle"
                                    disabled={recalculateMutation.isPending}
                                    onClick={() => {
                                        setRecalculatedCount(null);
                                        recalculateMutation.mutate(rule.id);
                                    }}
                                >
                                    <RefreshCw
                                        className={cn(
                                            'h-3.5 w-3.5 text-muted-foreground hover:text-accent',
                                            recalculateMutation.isPending &&
                                                recalculateMutation.variables === rule.id &&
                                                'animate-spin',
                                        )}
                                    />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Supprimer la règle"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => deleteMutation.mutate(rule.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-muted-foreground">
                    Aucune règle spécifique — la commission par défaut de l’employé s’applique.
                </p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        Service{form.service_ids.length > 1 ? 's' : ''}
                    </Label>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-2.5 text-xs text-foreground outline-none transition-colors',
                                    'focus:border-accent/60',
                                    form.service_ids.length === 0 && 'text-muted-foreground',
                                )}
                            >
                                <span className="truncate">{serviceTriggerLabel}</span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-64 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto">
                            {(services ?? []).length === 0 ? (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun service</p>
                            ) : (
                                (services ?? []).map((service) => (
                                    <DropdownMenuCheckboxItem
                                        key={service.id}
                                        checked={form.service_ids.includes(service.id)}
                                        onSelect={(event) => event.preventDefault()}
                                        onCheckedChange={() => toggleService(service.id)}
                                    >
                                        {service.name}
                                    </DropdownMenuCheckboxItem>
                                ))
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                        value={form.type}
                        onValueChange={(value) =>
                            setForm((current) => ({ ...current, type: value as 'percentage' | 'fixed' }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="percentage">Pourcentage</SelectItem>
                            <SelectItem value="fixed">Montant fixe</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Valeur</Label>
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.value}
                        onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                        placeholder={form.type === 'percentage' ? '10' : '25'}
                        className="h-9"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Depuis le</Label>
                    <Input
                        type="date"
                        value={form.starts_on}
                        onChange={(event) => setForm((current) => ({ ...current, starts_on: event.target.value }))}
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

            {recalculatedCount !== null && recalculatedCount > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-success/25 bg-success/[0.10] px-3 py-2">
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
                    <p className="text-xs text-success">
                        {recalculatedCount} prestation{recalculatedCount > 1 ? 's' : ''} déjà payée
                        {recalculatedCount > 1 ? 's' : ''} {recalculatedCount > 1 ? 'ont' : 'a'} été recalculée
                        {recalculatedCount > 1 ? 's' : ''} avec ce taux.
                    </p>
                </div>
            )}

            <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => {
                    setRecalculatedCount(null);
                    createMutation.mutate();
                }}
            >
                {createMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                Ajouter la règle
            </Button>
        </div>
    );
}
