import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, getErrorMessage, getServices } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Button } from '@/components/ui/button';
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
    service_id: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: '',
    starts_on: today(),
};

/** Per-employee, per-service commission rules — the priority override above the flat default rate. */
export function EmployeeCommissionRules({ employee }: { employee: Employee }) {
    const queryClient = useQueryClient();
    const [form, setForm] = useState(emptyForm);

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
            api.post('/api/employee-service-commissions', {
                employee_id: employee.id,
                service_id: Number(form.service_id),
                type: form.type,
                value: Number(form.value),
                starts_on: form.starts_on,
            }),
        onSuccess: () => {
            invalidate();
            setForm(emptyForm);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => api.delete(`/api/employee-service-commissions/${id}`),
        onSuccess: invalidate,
    });

    const canSubmit = form.service_id !== '' && form.value !== '' && Number(form.value) >= 0;

    return (
        <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Commissions par service
            </p>

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
                            <button
                                type="button"
                                aria-label="Supprimer la règle"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(rule.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
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
                    <Label className="text-xs">Service</Label>
                    <Select
                        value={form.service_id}
                        onValueChange={(value) => setForm((current) => ({ ...current, service_id: value }))}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Choisir…" />
                        </SelectTrigger>
                        <SelectContent>
                            {(services ?? []).map((service) => (
                                <SelectItem key={service.id} value={String(service.id)}>
                                    {service.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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

            <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate()}
            >
                {createMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                Ajouter la règle
            </Button>
        </div>
    );
}
