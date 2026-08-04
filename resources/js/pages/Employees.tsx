import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle,
    ChevronDown,
    Copy,
    KeyRound,
    Loader2,
    Mail,
    Pencil,
    Phone,
    Plus,
    Power,
    Search,
    ShieldCheck,
    Trash2,
    UserPlus,
    UserSquare2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
    createEmployee,
    deleteEmployee,
    getEmployees,
    getErrorMessage,
    quickCreateEmployeeAccount,
    resetEmployeePassword,
    updateEmployee,
} from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';
import type { Employee, EmployeePayload } from '@/types/workday';
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAdvances } from '@/components/workday/EmployeeAdvances';
import { EmployeeCommissionRules } from '@/components/workday/EmployeeCommissionRules';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

const colorOptions = ['#C8A24C', '#4C7CC8', '#2E7D5B', '#8C6BC8', '#C84C6B', '#1B2A4A'];

const emptyForm = {
    name: '',
    role: 'Coiffeur',
    email: '',
    phone: '',
    avatar_color: '#C8A24C',
    specialties: '',
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
        default_commission_rate: commission === '' ? null : Number(commission),
        is_active: form.is_active,
        login_email: form.login_email.trim() || null,
        login_password: form.login_password.trim() || null,
        system_role: form.login_email.trim() ? form.system_role : null,
    };
}

export default function Employees() {
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('employees.manage');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Employee | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<EmployeeFormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
    const [createdAccount, setCreatedAccount] = useState<{
        employeeName: string;
        loginEmail: string;
        temporaryPassword: string;
    } | null>(null);

    const { data: workDay } = useActiveWorkDay();
    const {
        data: employees = [],
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: [...workDayKeys.employees, 'admin', search],
        queryFn: () => getEmployees({ includeInactive: true, search: search.trim() || undefined }),
    });

    const activeCount = useMemo(
        () => employees.filter((employee) => employee.is_active).length,
        [employees],
    );

    const refreshEmployees = () => {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.employees });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const createMutation = useMutation({
        mutationFn: createEmployee,
        onSuccess: () => {
            refreshEmployees();
            closeDialog();
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: EmployeePayload }) =>
            updateEmployee(id, payload),
        onSuccess: () => {
            refreshEmployees();
            closeDialog();
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteEmployee,
        onSuccess: (_, id) => {
            if (expandedId === id) setExpandedId(null);
            refreshEmployees();
        },
    });

    const statusMutation = useMutation({
        mutationFn: (employee: Employee) =>
            updateEmployee(employee.id, { is_active: !employee.is_active }),
        onSuccess: refreshEmployees,
    });

    const resetPasswordMutation = useMutation({
        mutationFn: (employeeId: number) => resetEmployeePassword(employeeId),
        onSuccess: (result) => setTemporaryPassword(result.temporary_password),
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const quickCreateAccountMutation = useMutation({
        mutationFn: (employee: Employee) => quickCreateEmployeeAccount(employee.id),
        onSuccess: (result, employee) => {
            refreshEmployees();
            setCreatedAccount({
                employeeName: employee.name,
                loginEmail: result.login_email,
                temporaryPassword: result.temporary_password,
            });
        },
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    function openCreateDialog() {
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
        setDialogOpen(true);
    }

    function openEditDialog(employee: Employee) {
        setEditing(employee);
        setForm(employeeToForm(employee));
        setFormError(null);
        setTemporaryPassword(null);
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
        setTemporaryPassword(null);
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        const payload = formToPayload(form);
        if (!payload.name || !payload.role) {
            setFormError('Le nom et le poste sont obligatoires.');
            return;
        }

        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    function handleDelete(employee: Employee) {
        setDeletingEmployee(employee);
    }

    function confirmDelete() {
        if (!deletingEmployee) return;
        deleteMutation.mutate(deletingEmployee.id, { onSuccess: () => setDeletingEmployee(null) });
    }

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger l'équipe</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    Réessayer
                </Button>
            </Card>
        );
    }

    return (
        <>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
                <motion.div
                    variants={item}
                    className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
                >
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Équipe</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Fiches employés, statut, commissions et avances sur salaire.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Rechercher un employé..."
                                className="pl-10"
                            />
                        </div>
                        {canManage && (
                            <Button variant="accent" onClick={openCreateDialog}>
                                <Plus />
                                Ajouter
                            </Button>
                        )}
                    </div>
                </motion.div>

                <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{employees.length}</p>
                    </Card>
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Actifs</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-success">
                            {activeCount}
                        </p>
                    </Card>
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Inactifs</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-muted-foreground">
                            {employees.length - activeCount}
                        </p>
                    </Card>
                </motion.div>

                {isPending ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Card key={index} className="p-5">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-11 w-11 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-2/3" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : employees.length === 0 ? (
                    <EmptyState
                        icon={UserSquare2}
                        title="Aucun employé"
                        description="Ajoutez une fiche employé pour ouvrir une journée et suivre les commissions."
                    />
                ) : (
                    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {employees.map((employee) => {
                            const expanded = expandedId === employee.id;

                            return (
                                <motion.div key={employee.id} variants={item} layout>
                                    <Card
                                        className={cn(
                                            'p-5 transition-colors duration-200',
                                            expanded
                                                ? 'border-accent/25'
                                                : 'hover:border-accent/20',
                                            !employee.is_active && 'opacity-75',
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedId(expanded ? null : employee.id)
                                                }
                                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                            >
                                                <EmployeeAvatar
                                                    name={employee.name}
                                                    color={employee.avatar_color}
                                                    size="lg"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-foreground">
                                                        {employee.name}
                                                    </p>
                                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                        {employee.role}
                                                    </p>
                                                </div>

                                                <ChevronDown
                                                    className={cn(
                                                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                                                        expanded && 'rotate-180',
                                                    )}
                                                />
                                            </button>

                                            {canManage && (
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Modifier"
                                                        onClick={() => openEditDialog(employee)}
                                                    >
                                                        <Pencil />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label={
                                                            employee.is_active ? 'Désactiver' : 'Activer'
                                                        }
                                                        disabled={statusMutation.isPending}
                                                        onClick={() => statusMutation.mutate(employee)}
                                                    >
                                                        <Power />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Supprimer"
                                                        disabled={deleteMutation.isPending}
                                                        onClick={() => handleDelete(employee)}
                                                    >
                                                        <Trash2 className="text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center gap-2">
                                            {employee.account && (
                                                <Badge variant={employee.account.system_role === 'admin' ? 'accent' : 'outline'}>
                                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                                    {employee.account.system_role === 'admin' ? 'Administrateur/Caissier' : 'Compte employé'}
                                                </Badge>
                                            )}
                                            {employee.default_commission_rate !== null && (
                                                <Badge variant="accent">
                                                    {employee.default_commission_rate}% commission
                                                </Badge>
                                            )}
                                            <Badge variant={employee.is_active ? 'success' : 'outline'}>
                                                {employee.is_active ? 'Actif' : 'Inactif'}
                                            </Badge>
                                            {canManage && !employee.account && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="ml-auto h-7 px-2.5 text-xs"
                                                    disabled={quickCreateAccountMutation.isPending}
                                                    onClick={() => quickCreateAccountMutation.mutate(employee)}
                                                >
                                                    {quickCreateAccountMutation.isPending &&
                                                    quickCreateAccountMutation.variables?.id === employee.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <UserPlus className="h-3 w-3" />
                                                    )}
                                                    Créer un compte
                                                </Button>
                                            )}
                                        </div>

                                        <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                                            {employee.email && (
                                                <p className="flex items-center gap-2 truncate">
                                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                                    {employee.email}
                                                </p>
                                            )}
                                            {employee.phone && (
                                                <p className="flex items-center gap-2 truncate">
                                                    <Phone className="h-3.5 w-3.5 shrink-0" />
                                                    {employee.phone}
                                                </p>
                                            )}
                                        </div>

                                        {employee.specialties.length > 0 && (
                                            <div className="mt-4 flex flex-wrap gap-1.5">
                                                {employee.specialties.map((specialty) => (
                                                    <Badge key={specialty} variant="outline">
                                                        {specialty}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        <AnimatePresence initial={false}>
                                            {expanded && (
                                                <EmployeeAdvances
                                                    employee={employee}
                                                    workDayId={workDay?.id}
                                                />
                                            )}
                                        </AnimatePresence>

                                        {expanded && hasPermission('commissions.manage') && (
                                            <EmployeeCommissionRules employee={employee} />
                                        )}
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (open) setDialogOpen(true);
                    else closeDialog();
                }}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Modifier l\'employé' : 'Nouvel employé'}
                        </DialogTitle>
                        <DialogDescription>
                            Renseignez les informations utilisées dans la caisse, les commissions et
                            les rapports.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="employee-name">Nom</Label>
                                <Input
                                    id="employee-name"
                                    value={form.name}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            name: event.target.value,
                                        }))
                                    }
                                    placeholder="Amelie Rousseau"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="employee-role">Poste</Label>
                                <Input
                                    id="employee-role"
                                    value={form.role}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            role: event.target.value,
                                        }))
                                    }
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
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            email: event.target.value,
                                        }))
                                    }
                                    placeholder="amelie@bogosland.com"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="employee-phone">Téléphone</Label>
                                <Input
                                    id="employee-phone"
                                    value={form.phone}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            phone: event.target.value,
                                        }))
                                    }
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
                                        setForm((current) => ({
                                            ...current,
                                            default_commission_rate: event.target.value,
                                        }))
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
                                        setForm((current) => ({
                                            ...current,
                                            specialties: event.target.value,
                                        }))
                                    }
                                    placeholder="Coupe, Barbe, Coloration"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-md border border-tint/[0.06] bg-tint/[0.02] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Compte de connexion</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Permet à l’employé de se connecter avec son propre compte.
                                    </p>
                                </div>
                                {editing?.account && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={resetPasswordMutation.isPending}
                                        onClick={() => resetPasswordMutation.mutate(editing.id)}
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
                                            setForm((current) => ({
                                                ...current,
                                                login_email: event.target.value,
                                            }))
                                        }
                                        placeholder="employe@bogosland.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="employee-login-password">
                                        Mot de passe {editing?.account ? '(laisser vide pour ne pas changer)' : ''}
                                    </Label>
                                    <Input
                                        id="employee-login-password"
                                        type="password"
                                        value={form.login_password}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                login_password: event.target.value,
                                            }))
                                        }
                                        placeholder="8 caractères minimum"
                                        autoComplete="new-password"
                                    />
                                </div>

                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="employee-system-role">Rôle système</Label>
                                    <select
                                        id="employee-system-role"
                                        value={form.system_role}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                system_role: event.target.value as 'admin' | 'employee',
                                            }))
                                        }
                                        className="block h-10 w-full rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 text-sm outline-none transition-colors focus:border-accent/60"
                                    >
                                        <option value="employee">Employé — accède uniquement à son propre espace</option>
                                        <option value="admin">Administrateur/Caissier — accès de gestion complet</option>
                                    </select>
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
                                        onClick={() =>
                                            setForm((current) => ({
                                                ...current,
                                                avatar_color: color,
                                            }))
                                        }
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
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            avatar_color: event.target.value,
                                        }))
                                    }
                                    className="h-9 w-14 p-1"
                                />
                            </div>
                        </div>

                        <label className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        is_active: event.target.checked,
                                    }))
                                }
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
                            <Button type="button" variant="outline" onClick={closeDialog}>
                                Annuler
                            </Button>
                            <Button type="submit" variant="accent" disabled={saving}>
                                {saving && <Loader2 className="animate-spin" />}
                                {editing ? 'Enregistrer' : 'Créer'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deletingEmployee !== null}
                onOpenChange={(open) => {
                    if (!open) setDeletingEmployee(null);
                }}
                title="Supprimer cet employé ?"
                description={
                    deletingEmployee
                        ? `${deletingEmployee.name} sera définitivement supprimé(e). Cette action est irréversible.`
                        : undefined
                }
                confirmLabel="Supprimer"
                loading={deleteMutation.isPending}
                onConfirm={confirmDelete}
            />

            <Dialog open={createdAccount !== null} onOpenChange={(open) => { if (!open) setCreatedAccount(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Compte créé</DialogTitle>
                        <DialogDescription>
                            Communiquez ces identifiants à {createdAccount?.employeeName} — ils ne seront plus
                            affichés ensuite.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <CredentialRow label="Email de connexion" value={createdAccount?.loginEmail ?? ''} />
                        <CredentialRow label="Mot de passe" value={createdAccount?.temporaryPassword ?? ''} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="accent" onClick={() => setCreatedAccount(null)}>
                            Terminé
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <div className="flex items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 py-2.5">
                <span className="flex-1 truncate font-mono text-sm text-foreground">{value}</span>
                <button
                    type="button"
                    aria-label={`Copier ${label.toLowerCase()}`}
                    onClick={() => {
                        void navigator.clipboard.writeText(value);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-tint/[0.06] hover:text-foreground"
                >
                    {copied ? <ShieldCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            </div>
        </div>
    );
}
