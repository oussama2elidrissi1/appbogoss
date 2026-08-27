import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import { getErrorMessage, getUsers, resetUserPassword, updateUserAccess } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { User } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { CreatedAccountDialog, type CreatedAccount } from '@/components/workday/CreatedAccountDialog';
import { pageFade } from '@/lib/motion';

const ROLE_LABEL: Record<string, string> = {
    'super-admin': 'Super Admin',
    admin: 'Administrateur/Caissier',
    employee: 'Employé',
    partner: 'Partenaire',
};

const ROLE_BADGE_VARIANT: Record<string, 'accent' | 'success' | 'outline'> = {
    'super-admin': 'accent',
    admin: 'success',
    employee: 'outline',
    partner: 'outline',
};

export default function Comptes() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const { user: currentUser } = useAuth();
    const [resetTarget, setResetTarget] = useState<User | null>(null);
    const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);

    const {
        data: users,
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['users'],
        queryFn: getUsers,
    });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['users'] });
    }

    const roleMutation = useMutation({
        mutationFn: ({ id, role }: { id: number; role: string }) => updateUserAccess(id, { role }),
        onSuccess: invalidate,
    });

    const statusMutation = useMutation({
        mutationFn: (user: User) => updateUserAccess(user.id, { is_active: !user.is_active }),
        onSuccess: invalidate,
    });

    const resetMutation = useMutation({
        mutationFn: (user: User) => resetUserPassword(user.id),
        onSuccess: (result, user) => {
            setResetTarget(null);
            setCreatedAccount({
                employeeName: user.name,
                loginEmail: user.email,
                temporaryPassword: result.temporary_password,
            });
        },
    });

    return (
        <>
            <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{t('Comptes & accès')}</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('Tous les comptes de connexion de l’application — rôle, statut et mot de passe. Réservé au Super Admin.')}
                    </p>
                </div>

                {isPending ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full rounded-md" />
                        ))}
                    </div>
                ) : isError ? (
                    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <p className="mt-2 text-sm text-destructive">{getErrorMessage(error)}</p>
                        <Button variant="accent" className="mt-4" onClick={() => void refetch()}>
                            {t('Réessayer')}
                        </Button>
                    </Card>
                ) : !users || users.length === 0 ? (
                    <EmptyState
                        icon={ShieldCheck}
                        title={t('Aucun compte')}
                        description={t('Les comptes de connexion apparaîtront ici.')}
                    />
                ) : (
                    <div className="space-y-2">
                        {users.map((user) => {
                            const isSelf = user.id === currentUser?.id;

                            return (
                                <Card
                                    key={user.id}
                                    className={cn(
                                        'flex flex-wrap items-center gap-4 p-4',
                                        !user.is_active && 'opacity-70',
                                    )}
                                >
                                    <EmployeeAvatar name={user.name} color={isSelf ? '#C8A24C' : '#5B6B85'} />

                                    <div className="min-w-[10rem] flex-1">
                                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                                            {user.name}
                                            {isSelf && (
                                                <span className="text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground">
                                                    {t('(vous)')}
                                                </span>
                                            )}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {user.email}
                                            {user.employee_name ? ` · ${user.employee_name}` : ''}
                                        </p>
                                    </div>

                                    <div className="w-full sm:w-56">
                                        <Select
                                            value={user.role}
                                            disabled={isSelf || roleMutation.isPending}
                                            onValueChange={(value) => roleMutation.mutate({ id: user.id, role: value })}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="employee">{t(ROLE_LABEL.employee)}</SelectItem>
                                                <SelectItem value="partner">{t(ROLE_LABEL.partner)}</SelectItem>
                                                <SelectItem value="admin">{t(ROLE_LABEL.admin)}</SelectItem>
                                                <SelectItem value="super-admin">{t(ROLE_LABEL['super-admin'])}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'outline'} className="shrink-0">
                                        {t(ROLE_LABEL[user.role] ?? user.role)}
                                    </Badge>

                                    <Badge variant={user.is_active ? 'success' : 'outline'} className="shrink-0">
                                        {user.is_active ? t('Actif') : t('Désactivé')}
                                    </Badge>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={resetMutation.isPending}
                                            onClick={() => {
                                                setResetTarget(user);
                                                resetMutation.mutate(user);
                                            }}
                                        >
                                            <KeyRound className="h-3.5 w-3.5" />
                                            {t('Réinitialiser')}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isSelf || statusMutation.isPending}
                                            onClick={() => statusMutation.mutate(user)}
                                        >
                                            {user.is_active ? t('Désactiver') : t('Activer')}
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            <CreatedAccountDialog account={createdAccount} onClose={() => setCreatedAccount(null)} />

            {resetMutation.isError && resetTarget && (
                <div className="fixed bottom-6 right-6 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3 shadow-soft-lg">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                    <p className="text-xs text-destructive">{getErrorMessage(resetMutation.error)}</p>
                </div>
            )}
        </>
    );
}
