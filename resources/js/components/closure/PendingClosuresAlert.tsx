import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { getPeriods } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { formatPeriod } from '@/components/closure/PeriodSelector';

/**
 * Alerte « mois terminés non clôturés » du tableau de bord.
 *
 * Plusieurs mois peuvent s'accumuler — rien n'oblige à finaliser août avant
 * qu'octobre n'arrive — et c'est justement l'anomalie à rendre visible. Le
 * clic mène directement à la Paie du mois le plus ancien, celui qui traîne
 * depuis le plus longtemps.
 */
export function PendingClosuresAlert() {
    const { t } = useI18n();
    const { hasPermission } = useAuth();
    const { data } = useQuery({
        queryKey: ['periods'],
        queryFn: getPeriods,
        enabled: hasPermission('months.close'),
    });

    const pending = data?.to_finalize ?? [];
    if (pending.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                    <p className="text-sm font-semibold">
                        {pending.length === 1
                            ? t('Un mois est terminé mais pas encore clôturé.')
                            : t('{count} mois sont terminés mais pas encore clôturés.', {
                                  count: String(pending.length),
                              })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        <span className="capitalize">
                            {pending.map((entry) => formatPeriod(entry.period)).join(', ')}
                        </span>
                        {' — '}
                        {t('finalisez les paiements employés, puis clôturez.')}
                    </p>
                </div>
            </div>
            <Button asChild size="sm">
                <Link to="/paie">{t('Finaliser')}</Link>
            </Button>
        </div>
    );
}
