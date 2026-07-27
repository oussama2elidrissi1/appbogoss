import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, UserSquare2 } from 'lucide-react';
import { getEmployees, getErrorMessage } from '@/lib/api';
import { useActiveWorkDay, workDayKeys } from '@/hooks/useWorkDay';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { EmployeeAdvances } from '@/components/workday/EmployeeAdvances';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

/**
 * Team roster with the avances panel per employee. Deliberately scoped: full
 * employee CRUD lands in a later phase.
 */
export default function Employees() {
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const { data: workDay } = useActiveWorkDay();
    const { data: employees, isPending, isError, error, refetch } = useQuery({
        queryKey: workDayKeys.employees,
        queryFn: getEmployees,
    });

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger l’équipe</h2>
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
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
                <h2 className="text-2xl font-semibold tracking-tight">Équipe</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Commissions par défaut et suivi des avances sur salaire.
                </p>
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
                    description="L’équipe du salon s’affichera ici une fois les fiches créées."
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
                                        expanded ? 'border-accent/25' : 'hover:border-accent/20',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedId(expanded ? null : employee.id)
                                        }
                                        className="flex w-full items-center gap-3 text-left"
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

                                        <div className="flex shrink-0 items-center gap-2">
                                            {employee.default_commission_rate !== null && (
                                                <Badge variant="accent">
                                                    {employee.default_commission_rate}%
                                                </Badge>
                                            )}
                                            {!employee.is_active && (
                                                <Badge variant="outline">Inactif</Badge>
                                            )}
                                            <ChevronDown
                                                className={cn(
                                                    'h-4 w-4 text-muted-foreground transition-transform duration-200',
                                                    expanded && 'rotate-180',
                                                )}
                                            />
                                        </div>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {expanded && (
                                            <EmployeeAdvances
                                                employee={employee}
                                                workDayId={workDay?.id}
                                            />
                                        )}
                                    </AnimatePresence>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}
