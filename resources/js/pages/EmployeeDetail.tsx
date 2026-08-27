import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    Loader2,
    Mail,
    Pencil,
    Phone,
    Power,
    ShieldCheck,
    Trash2,
    UserPlus,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { deleteEmployee, getEmployee, getErrorMessage, quickCreateEmployeeAccount, updateEmployee } from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import type { Employee } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmployeeAdvances } from '@/components/workday/EmployeeAdvances';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { EmployeeCommissionRules } from '@/components/workday/EmployeeCommissionRules';
import { EmployeeFormDialog } from '@/components/workday/EmployeeFormDialog';
import { EmployeePayroll } from '@/components/workday/EmployeePayroll';
import { CreatedAccountDialog, type CreatedAccount } from '@/components/workday/CreatedAccountDialog';

export default function EmployeeDetail() {
    const { t } = useI18n();
    const { id } = useParams<{ id: string }>();
    const employeeId = Number(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('employees.manage');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);

    const { data: workDay } = useActiveWorkDay();
    const {
        data: employee,
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: [...workDayKeys.employees, employeeId],
        queryFn: () => getEmployee(employeeId),
        enabled: Number.isFinite(employeeId),
    });

    function refreshEmployee() {
        void queryClient.invalidateQueries({ queryKey: workDayKeys.employees });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const statusMutation = useMutation({
        mutationFn: (current: Employee) => updateEmployee(current.id, { is_active: !current.is_active }),
        onSuccess: refreshEmployee,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteEmployee,
        onSuccess: () => {
            refreshEmployee();
            navigate('/employees');
        },
    });

    const quickCreateAccountMutation = useMutation({
        mutationFn: (current: Employee) => quickCreateEmployeeAccount(current.id),
        onSuccess: (result, current) => {
            refreshEmployee();
            setCreatedAccount({
                employeeName: current.name,
                loginEmail: result.login_email,
                temporaryPassword: result.temporary_password,
            });
        },
    });

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">{t('Impossible de charger cette fiche')}</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <div className="mt-6 flex items-center gap-2">
                    <Button variant="outline" onClick={() => navigate('/employees')}>
                        <ArrowLeft />
                        {t('Retour')}
                    </Button>
                    <Button variant="accent" onClick={() => void refetch()}>
                        {t('Réessayer')}
                    </Button>
                </div>
            </Card>
        );
    }

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="space-y-6"
            >
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-muted-foreground"
                    onClick={() => navigate('/employees')}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('Retour à l’équipe')}
                </Button>

                {isPending || !employee ? (
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="h-3.5 w-1/4" />
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className={`p-5 sm:p-6 ${!employee.is_active ? 'opacity-75' : ''}`}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-center gap-4">
                                <EmployeeAvatar name={employee.name} color={employee.avatar_color} size="lg" />
                                <div className="min-w-0">
                                    <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
                                        {employee.name}
                                    </h2>
                                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{employee.role}</p>
                                </div>
                            </div>

                            {canManage && (
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                        {t('Modifier')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={statusMutation.isPending}
                                        onClick={() => statusMutation.mutate(employee)}
                                    >
                                        <Power className="h-3.5 w-3.5" />
                                        {employee.is_active ? t('Désactiver') : t('Activer')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        disabled={deleteMutation.isPending}
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        {t('Supprimer')}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {employee.account && (
                                <Badge variant={employee.account.system_role === 'admin' ? 'accent' : 'outline'}>
                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                    {employee.account.system_role === 'admin' ? t('Administrateur/Caissier') : t('Compte employé')}
                                </Badge>
                            )}
                            {employee.default_commission_rate !== null && (
                                <Badge variant="accent">{employee.default_commission_rate}% {t('commission')}</Badge>
                            )}
                            <Badge variant={employee.is_active ? 'success' : 'outline'}>
                                {employee.is_active ? t('Actif') : t('Inactif')}
                            </Badge>
                            {canManage && !employee.account && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs"
                                    disabled={quickCreateAccountMutation.isPending}
                                    onClick={() => quickCreateAccountMutation.mutate(employee)}
                                >
                                    {quickCreateAccountMutation.isPending ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <UserPlus className="h-3 w-3" />
                                    )}
                                    {t('Créer un compte')}
                                </Button>
                            )}
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {employee.email && (
                                <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                                    <Mail className="h-4 w-4 shrink-0" />
                                    {employee.email}
                                </p>
                            )}
                            {employee.phone && (
                                <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                                    <Phone className="h-4 w-4 shrink-0" />
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
                    </Card>
                )}

                {employee && (
                    <Tabs defaultValue="advances" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="advances">{t('Avances')}</TabsTrigger>
                            {hasPermission('commissions.manage') && (
                                <>
                                    <TabsTrigger value="commissions">{t('Commissions')}</TabsTrigger>
                                    <TabsTrigger value="payroll">{t('Paie')}</TabsTrigger>
                                </>
                            )}
                        </TabsList>

                        <TabsContent value="advances">
                            <Card className="p-5 sm:p-6">
                                <EmployeeAdvances employee={employee} workDayId={workDay?.id} />
                            </Card>
                        </TabsContent>

                        {hasPermission('commissions.manage') && (
                            <>
                                <TabsContent value="commissions">
                                    <Card className="p-5 sm:p-6">
                                        <EmployeeCommissionRules employee={employee} />
                                    </Card>
                                </TabsContent>
                                <TabsContent value="payroll">
                                    <Card className="p-5 sm:p-6">
                                        <EmployeePayroll employee={employee} />
                                    </Card>
                                </TabsContent>
                            </>
                        )}
                    </Tabs>
                )}
            </motion.div>

            {employee && <EmployeeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} employee={employee} />}

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t('Supprimer cet employé ?')}
                description={
                    employee
                        ? t('{name} sera définitivement supprimé(e). Cette action est irréversible.', { name: employee.name })
                        : undefined
                }
                confirmLabel={t('Supprimer')}
                loading={deleteMutation.isPending}
                onConfirm={() => {
                    if (employee) deleteMutation.mutate(employee.id, { onSuccess: () => setDeleteOpen(false) });
                }}
            />

            <CreatedAccountDialog account={createdAccount} onClose={() => setCreatedAccount(null)} />
        </>
    );
}
