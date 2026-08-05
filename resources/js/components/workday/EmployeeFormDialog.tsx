import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, KeyRound, Loader2 } from 'lucide-react';
import {
    createEmployee,
    getErrorMessage,
    getServices,
    resetEmployeePassword,
    updateEmployee,
} from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';
import { CATEGORIES, getCategoryLabel } from '@/components/workday/categories';
import type { Employee, EmployeePayload, Service } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const colorOptions = ['#C8A24C', '#4C7CC8', '#2E7D5B', '#8C6BC8', '#C84C6B', '#1B2A4A'];

const emptyForm = {
    name: '',
    role: 'Coiffeur',
    email: '',
    phone: '',
    avatar_color: '#C8A24C',
    specialties: '',
    service_categories: [] as string[],
    allowed_service_ids: [] as number[],
    default_commission_rate: '',
    is_active: true,
    login_email: '',
    login_password: '',
    system_role: 'employee' as 'admin' | 'employee',
};

type EmployeeFormState = typeof emptyForm;

function employeeToForm(employee: Employee): EmployeeFormState {
    return {
        name: employee.name,
        role: employee.role,
        email: employee.email ?? '',
        phone: employee.phone ?? '',
        avatar_color: employee.avatar_color,
        specialties: employee.specialties.join(', '),
        service_categories: employee.service_categories,
        allowed_service_ids: employee.allowed_service_ids,
        default_commission_rate:
            employee.default_commission_rate !== null ? String(employee.default_commission_rate) : '',
        is_active: employee.is_active,
        login_email: employee.account?.login_email ?? '',
        login_password: '',
        system_role: employee.account?.system_role === 'admin' ? 'admin' : 'employee',
    };
}

function formToPayload(form: EmployeeFormState): EmployeePayload {
    const commission = form.default_commission_rate.trim();

    return {
        name: form.name.trim(),
        role: form.role.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        avatar_color: form.avatar_color,
        specialties: form.specialties
            .split(',')
            .map((specialty) => specialty.trim())
            .filter(Boolean),
        service_categories: form.service_categories,
        allowed_service_ids: form.allowed_service_ids,
        default_commission_rate: commission === '' ? null : Number(commission),
        is_active: form.is_active,
        login_email: form.login_email.trim() || null,
        login_password: form.login_password.trim() || null,
        system_role: form.login_email.trim() ? form.system_role : null,
    };
}

interface EmployeeFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = create mode */
    employee: Employee | null;
    onSaved?: (employee: Employee) => void;
}

/**
 * Shared create/edit form — used both from the team list (create, quick edit)
 * and from the employee detail page (edit), so the two never drift apart.
 */
export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }: EmployeeFormDialogProps) {
    const queryClient = useQueryClient();
    const [form, setForm] = useState<EmployeeFormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setForm(employee ? employeeToForm(employee) : emptyForm);
        setFormError(null);
        setTemporaryPassword(null);
    }, [open, employee]);

    const { data: allServices } = useQuery({
        queryKey: ['services', 'all', 'employee-picker'],
        queryFn: () => getServices({ includeInactive: false }),
        staleTime: 5 * 60_000,
        enabled: open,
    });

    function toggleAllowedService(serviceId: number) {
        setForm((current) => ({
            ...current,
            allowed_service_ids: current.allowed_service_ids.includes(serviceId)
                ? current.allowed_service_ids.filter((id) => id !== serviceId)
                : [...current.allowed_service_ids, serviceId],
        }));
    }

    const allowedServicesLabel =
        form.allowed_service_ids.length === 0
            ? 'Tous les services des catégories ci-dessus'
            : `${form.allowed_service_ids.length} service${form.allowed_service_ids.length > 1 ? 's' : ''} sélectionné${form.allowed_service_ids.length > 1 ? 's' : ''}`;

    const servicesByCategory = new Map<string, Service[]>();
    for (const service of allServices ?? []) {
        const list = servicesByCategory.get(service.category) ?? [];
        list.push(service);
        servicesByCategory.set(service.category, list);
    }

    function refreshEmployees() {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.employees });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const createMutation = useMutation({
        mutationFn: createEmployee,
        onSuccess: (created) => {
            refreshEmployees();
            onSaved?.(created);
            onOpenChange(false);
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: EmployeePayload }) => updateEmployee(id, payload),
        onSuccess: (updated) => {
            refreshEmployees();
            onSaved?.(updated);
            onOpenChange(false);
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const resetPasswordMutation = useMutation({
        mutationFn: (employeeId: number) => resetEmployeePassword(employeeId),
        onSuccess: (result) => setTemporaryPassword(result.temporary_password),
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        const payload = formToPayload(form);
        if (!payload.name || !payload.role) {
            setFormError('Le nom et le poste sont obligatoires.');
            return;
        }

        if (employee) {
            updateMutation.mutate({ id: employee.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{employee ? "Modifier l'employé" : 'Nouvel employé'}</DialogTitle>
                    <DialogDescription>
                        Renseignez les informations utilisées dans la caisse, les commissions et les rapports.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="employee-name">Nom</Label>
                            <Input
                                id="employee-name"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="Amelie Rousseau"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employee-role">Poste</Label>
                            <Input
                                id="employee-role"
                                value={form.role}
                                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                                placeholder="Coiffeur"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employee-email">Email</Label>
                            <Input
                                id="employee-email"
                                type="email"
                                value={form.email}
                                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                placeholder="amelie@bogosland.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employee-phone">Téléphone</Label>
                            <Input
                                id="employee-phone"
                                value={form.phone}
                                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                                placeholder="06 00 00 00 00"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employee-commission">Commission par défaut (%)</Label>
                            <Input
                                id="employee-commission"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.default_commission_rate}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, default_commission_rate: event.target.value }))
                                }
                                placeholder="10"
                                inputMode="decimal"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="employee-specialties">Spécialités</Label>
                            <Input
                                id="employee-specialties"
                                value={form.specialties}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, specialties: event.target.value }))
                                }
                                placeholder="Coupe, Barbe, Coloration"
                            />
                        </div>
                    </div>

                    <div className="space-y-2.5">
                        <Label>Catégories de services</Label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map((option) => {
                                const Icon = option.icon;
                                const selected = form.service_categories.includes(option.value);
                                return (
                                    <Chip
                                        key={option.value}
                                        size="sm"
                                        selected={selected}
                                        onClick={() =>
                                            setForm((current) => ({
                                                ...current,
                                                service_categories: selected
                                                    ? current.service_categories.filter((value) => value !== option.value)
                                                    : [...current.service_categories, option.value],
                                            }))
                                        }
                                    >
                                        <Icon className={cn('h-3.5 w-3.5', selected ? option.chip : 'text-muted-foreground')} />
                                        {option.label}
                                    </Chip>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Détermine ce que l’employé voit dans « Nouvelle prestation » sur son espace.
                            Aucune sélection = toutes les catégories.
                        </p>
                    </div>

                    <div className="space-y-2.5">
                        <Label>Services autorisés</Label>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm text-foreground outline-none transition-colors',
                                        'focus:border-accent/60',
                                        form.allowed_service_ids.length === 0 && 'text-muted-foreground',
                                    )}
                                >
                                    <span className="truncate">{allowedServicesLabel}</span>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-h-80 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto">
                                {servicesByCategory.size === 0 ? (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun service</p>
                                ) : (
                                    Array.from(servicesByCategory.entries()).map(([category, services], index) => (
                                        <div key={category}>
                                            {index > 0 && <DropdownMenuSeparator />}
                                            <DropdownMenuLabel>{getCategoryLabel(category)}</DropdownMenuLabel>
                                            {services.map((service) => (
                                                <DropdownMenuCheckboxItem
                                                    key={service.id}
                                                    checked={form.allowed_service_ids.includes(service.id)}
                                                    onSelect={(event) => event.preventDefault()}
                                                    onCheckedChange={() => toggleAllowedService(service.id)}
                                                >
                                                    {service.name}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="text-[11px] text-muted-foreground">
                            Restreint « Nouvelle prestation » à exactement ces services — plus précis que les
                            catégories ci-dessus. Aucune sélection = tous les services des catégories autorisées.
                        </p>
                    </div>

                    <div className="space-y-4 rounded-md border border-tint/[0.06] bg-tint/[0.02] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Compte de connexion</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Permet à l’employé de se connecter avec son propre compte.
                                </p>
                            </div>
                            {employee?.account && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={resetPasswordMutation.isPending}
                                    onClick={() => resetPasswordMutation.mutate(employee.id)}
                                >
                                    <KeyRound className="h-3.5 w-3.5" />
                                    Réinitialiser le mot de passe
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="employee-login-email">Email de connexion</Label>
                                <Input
                                    id="employee-login-email"
                                    type="email"
                                    value={form.login_email}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, login_email: event.target.value }))
                                    }
                                    placeholder="employe@bogosland.com"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="employee-login-password">
                                    Mot de passe {employee?.account ? '(laisser vide pour ne pas changer)' : ''}
                                </Label>
                                <Input
                                    id="employee-login-password"
                                    type="password"
                                    value={form.login_password}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, login_password: event.target.value }))
                                    }
                                    placeholder="8 caractères minimum"
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="employee-system-role">Rôle système</Label>
                                <Select
                                    value={form.system_role}
                                    onValueChange={(value) =>
                                        setForm((current) => ({ ...current, system_role: value as 'admin' | 'employee' }))
                                    }
                                >
                                    <SelectTrigger id="employee-system-role" className="h-10 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="employee" className="text-sm">
                                            Employé — accède uniquement à son propre espace
                                        </SelectItem>
                                        <SelectItem value="admin" className="text-sm">
                                            Administrateur/Caissier — accès de gestion complet
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Couleur</Label>
                        <div className="flex flex-wrap items-center gap-2">
                            {colorOptions.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`Couleur ${color}`}
                                    onClick={() => setForm((current) => ({ ...current, avatar_color: color }))}
                                    className={cn(
                                        'h-9 w-9 rounded-full border transition-all duration-200',
                                        form.avatar_color === color
                                            ? 'border-accent ring-4 ring-accent/15'
                                            : 'border-tint/10 hover:border-tint/30',
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                            <Input
                                type="color"
                                value={form.avatar_color}
                                onChange={(event) => setForm((current) => ({ ...current, avatar_color: event.target.value }))}
                                className="h-9 w-14 p-1"
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
                        <span className="text-sm font-medium text-foreground">Employé actif</span>
                    </label>

                    {temporaryPassword && (
                        <div className="rounded-md border border-success/25 bg-success/[0.10] px-3.5 py-3">
                            <p className="text-sm font-medium text-success">
                                Nouveau mot de passe : <span className="font-mono">{temporaryPassword}</span>
                            </p>
                            <p className="mt-1 text-xs text-success/80">
                                Communiquez-le à l’employé — il ne sera plus affiché ensuite.
                            </p>
                        </div>
                    )}

                    {formError && (
                        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{formError}</p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Annuler
                        </Button>
                        <Button type="submit" variant="accent" disabled={saving}>
                            {saving && <Loader2 className="animate-spin" />}
                            {employee ? 'Enregistrer' : 'Créer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
