import { useMemo, useState, type MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ChevronRight,
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
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { deleteEmployee, getEmployees, getErrorMessage, quickCreateEmployeeAccount, updateEmployee } from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { EmployeeFormDialog } from '@/components/workday/EmployeeFormDialog';
import { CreatedAccountDialog, type CreatedAccount } from '@/components/workday/CreatedAccountDialog';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

export default function Employees() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('employees.manage');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Employee | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
    const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);

    useActiveWorkDay();
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

    const activeCount = useMemo(() => employees.filter((employee) => employee.is_active).length, [employees]);

    function refreshEmployees() {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.employees });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const deleteMutation = useMutation({
        mutationFn: deleteEmployee,
        onSuccess: refreshEmployees,
    });

    const statusMutation = useMutation({
        mutationFn: (employee: Employee) => updateEmployee(employee.id, { is_active: !employee.is_active }),
        onSuccess: refreshEmployees,
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

    function openCreateDialog() {
        setEditing(null);
        setDialogOpen(true);
    }

    function openEditDialog(employee: Employee, event: MouseEvent) {
        event.stopPropagation();
        setEditing(employee);
        setDialogOpen(true);
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
                <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
                        <p className="mt-1 text-xl font-semibold tabular-nums text-success">{activeCount}</p>
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
                    <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {employees.map((employee) => (
                            <motion.div key={employee.id} variants={item}>
                                <Card
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/employees/${employee.id}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            navigate(`/employees/${employee.id}`);
                                        }
                                    }}
                                    className={cn(
                                        'flex h-full flex-col p-5 transition-colors duration-200',
                                        'cursor-pointer hover:border-accent/25',
                                        !employee.is_active && 'opacity-75',
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <EmployeeAvatar name={employee.name} color={employee.avatar_color} size="lg" />

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{employee.role}</p>
                                        </div>

                                        {canManage ? (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label="Modifier"
                                                    onClick={(event) => openEditDialog(employee, event)}
                                                >
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={employee.is_active ? 'Désactiver' : 'Activer'}
                                                    disabled={statusMutation.isPending}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        statusMutation.mutate(employee);
                                                    }}
                                                >
                                                    <Power />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label="Supprimer"
                                                    disabled={deleteMutation.isPending}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setDeletingEmployee(employee);
                                                    }}
                                                >
                                                    <Trash2 className="text-destructive" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/60" />
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
                                            <Badge variant="accent">{employee.default_commission_rate}% commission</Badge>
                                        )}
                                        <Badge variant={employee.is_active ? 'success' : 'outline'}>
                                            {employee.is_active ? 'Actif' : 'Inactif'}
                                        </Badge>
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

                                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                                        {canManage && !employee.account ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2.5 text-xs"
                                                disabled={quickCreateAccountMutation.isPending}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    quickCreateAccountMutation.mutate(employee);
                                                }}
                                            >
                                                {quickCreateAccountMutation.isPending &&
                                                quickCreateAccountMutation.variables?.id === employee.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <UserPlus className="h-3 w-3" />
                                                )}
                                                Créer un compte
                                            </Button>
                                        ) : (
                                            <span />
                                        )}
                                        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-accent">
                                            Voir la fiche
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </span>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>

            <EmployeeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} employee={editing} />

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

            <CreatedAccountDialog account={createdAccount} onClose={() => setCreatedAccount(null)} />
        </>
    );
}
