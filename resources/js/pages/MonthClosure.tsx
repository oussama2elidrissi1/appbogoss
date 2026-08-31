import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarCheck, CheckCircle2, ChevronRight, FileCheck2 } from 'lucide-react';
import { getClosureChecklist, getErrorMessage, getPeriods } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthClosureDialog } from '@/components/closure/MonthClosureDialog';
import { formatPeriod } from '@/components/closure/PeriodSelector';
import { employeesHint, unsettledEmployees, workDaysHint } from '@/components/closure/ClosureProcedure';
import { pageFade } from '@/lib/motion';

/**
 * « Clôture du mois » — la porte d'entrée de la procédure.
 *
 * Elle existe parce que la clôture n'était atteignable que par un bandeau
 * apparaissant sur la page Paie si l'on pensait à reculer d'un mois : rien
 * n'annonçait la procédure, et personne ne pouvait la découvrir seul. Cette
 * page répond aux deux questions dans l'ordre où elles se posent — comment ça
 * marche, et qu'ai-je à faire maintenant.
 */
export default function MonthClosure() {
    const { t } = useI18n();
    const [closing, setClosing] = useState<string | null>(null);

    const { data, isPending, isError, error } = useQuery({
        queryKey: ['periods'],
        queryFn: getPeriods,
    });

    const pending = data?.to_finalize ?? [];

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Clôture du mois')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Finaliser un mois terminé : paiements employés, journées de caisse, puis clôture définitive.')}
                </p>
            </div>

            <Card>
                <CardContent className="p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('Comment ça marche')}
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm">
                        {/* Ce qui surprend le plus est qu'aucun geste n'ouvre le
                            nouveau mois — le dire évite de chercher un bouton
                            qui n'existe pas. */}
                        <Bullet>
                            {t("Le 1er de chaque mois, le nouveau mois démarre tout seul, compteurs à zéro. Vous n'avez rien à faire pour l'ouvrir.")}
                        </Bullet>
                        <Bullet>
                            {t("Le mois précédent reste ouvert : vous pouvez encore y payer les employés et corriger ce qui doit l'être.")}
                        </Bullet>
                        <Bullet>
                            {t('Quand tout est réglé, vous le clôturez. Il devient alors définitivement non modifiable.')}
                        </Bullet>
                    </ul>
                    {data && (
                        <p className="mt-3 text-sm text-muted-foreground">
                            {t('Mois en cours')}&nbsp;:{' '}
                            <span className="capitalize">{formatPeriod(data.current)}</span>{' '}
                            {t("— il ne se clôture qu'une fois terminé.")}
                        </p>
                    )}
                </CardContent>
            </Card>

            <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {pending.length > 0 ? `${t('À finaliser')} (${pending.length})` : t('À finaliser')}
                </h3>

                {isPending && <Skeleton className="h-28 w-full" />}

                {isError && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {getErrorMessage(error)}
                    </p>
                )}

                {data && pending.length === 0 && (
                    <Card>
                        <CardContent className="flex items-center gap-3 p-4">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                            <p className="text-sm">
                                {t('Aucun mois à finaliser.')}{' '}
                                <span className="capitalize">{formatPeriod(data.current)}</span>{' '}
                                {t('pourra être clôturé une fois le mois terminé.')}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="space-y-3">
                    {pending.map((entry) => (
                        <PendingMonthCard
                            key={entry.period}
                            period={entry.period}
                            onOpen={() => setClosing(entry.period)}
                        />
                    ))}
                </div>
            </div>

            {closing && (
                <MonthClosureDialog
                    period={closing}
                    open
                    onOpenChange={(open) => !open && setClosing(null)}
                />
            )}
        </motion.div>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2.5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{children}</span>
        </li>
    );
}

/**
 * Un mois terminé et non clôturé. Sa checklist est chargée ici pour que ce qui
 * bloque se lise avant même d'ouvrir la fenêtre de clôture.
 */
function PendingMonthCard({ period, onOpen }: { period: string; onOpen: () => void }) {
    const { t } = useI18n();
    const { data: checklist } = useQuery({
        queryKey: ['closure-checklist', period],
        queryFn: () => getClosureChecklist(period),
    });

    return (
        <Card>
            <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                    <CalendarCheck className="h-5 w-5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold capitalize">{formatPeriod(period)}</p>
                        <p className="text-xs text-muted-foreground">{t('À finaliser')}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                {checklist && (
                    <>
                        <div className="grid gap-1 text-sm sm:grid-cols-2">
                            <p className="text-muted-foreground">{employeesHint(checklist)}</p>
                            <p className="text-muted-foreground">{workDaysHint(checklist)}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={onOpen}>
                            <FileCheck2 className="mr-2 h-4 w-4" />
                            {checklist.can_close && unsettledEmployees(checklist).length === 0
                                ? t('Clôturer ce mois')
                                : t('Voir ce qui bloque')}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
