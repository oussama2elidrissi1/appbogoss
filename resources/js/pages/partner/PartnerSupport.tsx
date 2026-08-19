import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { HelpCircle, Mail, MapPin, Phone } from 'lucide-react';
import { getSettings } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';

const FAQ = [
    {
        q: 'Comment savoir si ma réservation a été acceptée ?',
        a: 'Son statut passe de « En attente » à « Confirmée » dans Mes réservations dès que BOGOSLAND la valide.',
    },
    {
        q: 'Quand ma commission est-elle validée ?',
        a: 'Une fois votre client réellement reçu et son paiement encaissé au salon — visible dans Mes commissions.',
    },
    {
        q: 'Quand suis-je payé ?',
        a: 'BOGOSLAND règle vos commissions validées périodiquement ; elles passent alors au statut « Payée », avec la date de règlement.',
    },
    {
        q: 'Puis-je voir les clients des autres partenaires ?',
        a: 'Non — votre portefeuille clients est strictement privé, visible uniquement par vous et BOGOSLAND.',
    },
];

export default function PartnerSupport() {
    const { data: settings, isPending } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Une question ? Contactez l'équipe BOGOSLAND.</p>
            </div>

            <Card className="p-5 sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Contact</h2>
                {isPending ? (
                    <div className="mt-4 space-y-3">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-5 w-40" />
                    </div>
                ) : (
                    <div className="mt-4 space-y-3 text-sm">
                        {settings?.salon_phone && (
                            <a
                                href={`tel:${settings.salon_phone}`}
                                className="flex items-center gap-2.5 text-foreground hover:text-accent"
                            >
                                <Phone className="h-4 w-4 text-accent" />
                                {settings.salon_phone}
                            </a>
                        )}
                        {settings?.salon_email && (
                            <a
                                href={`mailto:${settings.salon_email}`}
                                className="flex items-center gap-2.5 text-foreground hover:text-accent"
                            >
                                <Mail className="h-4 w-4 text-accent" />
                                {settings.salon_email}
                            </a>
                        )}
                        {settings?.salon_address && (
                            <p className="flex items-center gap-2.5 text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0 text-accent" />
                                {settings.salon_address}
                            </p>
                        )}
                    </div>
                )}
            </Card>

            <Card className="p-5 sm:p-6">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Questions fréquentes
                </h2>
                <div className="mt-4 space-y-4">
                    {FAQ.map((item) => (
                        <div key={item.q}>
                            <p className="text-sm font-medium text-foreground">{item.q}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
                        </div>
                    ))}
                </div>
            </Card>
        </motion.div>
    );
}
