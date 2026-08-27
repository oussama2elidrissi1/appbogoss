import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { getEmployeeDocuments } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { EmployeePageShell, EmployeePanel, EmployeePanelTitle } from '@/pages/employee/EmployeeLayout';

export default function EmployeeDocuments() {
    const { t } = useI18n();
    const { data } = useQuery({
        queryKey: ['employee-workspace', 'documents'],
        queryFn: getEmployeeDocuments,
    });

    return (
        <EmployeePageShell>
            <div>
                <h2 className="text-2xl font-semibold">{t('Mes documents')}</h2>
                <p className="text-sm text-white/50">{t('Documents autorises pour votre compte.')}</p>
            </div>
            <EmployeePanel>
                <EmployeePanelTitle title={t('Documents')} icon={FileText} />
                <div className="p-4">
                    {!data || data.documents.length === 0 ? (
                        <p className="rounded-md border border-white/[0.07] bg-white/[0.035] px-4 py-12 text-center text-white/50">
                            {data?.empty_state ?? t('Aucun document disponible.')}
                        </p>
                    ) : data.documents.map((document) => (
                        <a key={document.id} href={document.url} className="block rounded-md border border-white/[0.07] bg-white/[0.035] p-4 hover:border-[#c8a24c]/40">
                            <strong>{document.title}</strong>
                            <span className="ml-2 text-sm text-white/45">{document.type}</span>
                        </a>
                    ))}
                </div>
            </EmployeePanel>
        </EmployeePageShell>
    );
}

