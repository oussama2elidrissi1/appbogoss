import { motion } from 'framer-motion';
import { NewPrestationPanel } from '@/components/prestations/NewPrestationPanel';
import { MyPrestationsList } from '@/components/prestations/MyPrestationsList';
import { MyCommissionsList } from '@/components/prestations/MyCommissionsList';
import { MyAdvancesList } from '@/components/prestations/MyAdvancesList';
import { MyReportPanel } from '@/components/prestations/MyReportPanel';
import { MyDashboardSummary } from '@/components/prestations/MyDashboardSummary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pageFade } from '@/lib/motion';
import { useI18n } from '@/lib/i18n';

export default function MonEspace() {
    const { t } = useI18n();
    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Mon espace')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t('Créez vos prestations et suivez vos commissions.')}
                </p>
            </div>

            <MyDashboardSummary />

            <Tabs defaultValue="new" className="space-y-5">
                <TabsList>
                    <TabsTrigger value="new">{t('Nouvelle prestation')}</TabsTrigger>
                    <TabsTrigger value="mine">{t('Mes prestations')}</TabsTrigger>
                    <TabsTrigger value="commissions">{t('Mes commissions')}</TabsTrigger>
                    <TabsTrigger value="advances">{t('Mes avances')}</TabsTrigger>
                    <TabsTrigger value="report">{t('Mon rapport')}</TabsTrigger>
                </TabsList>
                <TabsContent value="new" className="space-y-5">
                    <NewPrestationPanel />
                </TabsContent>
                <TabsContent value="mine" className="space-y-5">
                    <MyPrestationsList />
                </TabsContent>
                <TabsContent value="commissions" className="space-y-5">
                    <MyCommissionsList />
                </TabsContent>
                <TabsContent value="advances" className="space-y-5">
                    <MyAdvancesList />
                </TabsContent>
                <TabsContent value="report" className="space-y-5">
                    <MyReportPanel />
                </TabsContent>
            </Tabs>
        </motion.div>
    );
}
