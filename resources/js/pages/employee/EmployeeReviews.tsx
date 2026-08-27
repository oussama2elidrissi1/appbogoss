import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { getEmployeeReviews } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

export default function EmployeeReviews() {
    const { t } = useI18n();
    const { data } = useQuery({
        queryKey: ['employee-workspace', 'reviews'],
        queryFn: getEmployeeReviews,
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Mes avis')}</h2>
                <p className="text-sm text-white/50">{t('Retours clients rattaches a vos prestations.')}</p>
            </div>
            <EmployeePanel>
                <EmployeePanelTitle title={t('Avis clients')} icon={Star} />
                <div className="p-4">
                    {!data || data.summary.count === 0 ? (
                        <p className="rounded-md border border-white/[0.07] bg-white/[0.035] px-4 py-12 text-center text-white/50">
                            {t("Vous n'avez pas encore recu d'avis.")}
                        </p>
                    ) : (
                        <>
                            <div className="mb-4 rounded-md border border-[#c8a24c]/25 bg-[#c8a24c]/10 p-4">
                                <p className="text-4xl font-bold">{data.summary.average} <span className="text-base text-white/45">/ 5</span></p>
                                <p className="mt-1 text-[#d5b15d]">{'★'.repeat(Math.round(data.summary.average ?? 0))}</p>
                                <p className="text-sm text-white/50">{t('Base sur {n} avis', { n: data.summary.count })}</p>
                            </div>
                            <div className="space-y-2">
                                {data.rows.map((review) => (
                                    <div key={review.id} className="rounded-md border border-white/[0.07] bg-white/[0.035] p-4">
                                        <div className="flex justify-between gap-3">
                                            <p className="font-semibold">{review.client_name}</p>
                                            <span className="text-[#d5b15d]">{'★'.repeat(review.rating)}</span>
                                        </div>
                                        {review.comment && <p className="mt-2 text-sm text-white/70">{review.comment}</p>}
                                        {review.reviewed_at && <p className="mt-2 text-xs text-white/42">{formatDate(review.reviewed_at)}</p>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

