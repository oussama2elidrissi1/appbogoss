import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    Banknote,
    Building2,
    CalendarCheck,
    HandCoins,
    IdCard,
    Users,
    Wallet2,
} from 'lucide-react';
import { getAdminPartnerCommissions, getAppointments, getClientsByPartner, getErrorMessage, getPartnerDetail } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pageFade } from '@/lib/motion';
import type { PartnerStatus } from '@/types/workday';

const STATUS_META: Record<PartnerStatus, { label: string; variant: 'success' | 'outline' | 'destructive' }> = {
    pending: { label: 'En attente', variant: 'outline' },
    active: { label: 'Actif', variant: 'success' },
    suspended: { label: 'Suspendu', variant: 'destructive' },
    disabled: { label: 'Désactivé', variant: 'destructive' },
};

function wideRange(): { from: string; to: string } {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 2);
    const to = new Date(today);
    to.setFullYear(to.getFullYear() + 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const partnerId = Number(id);

    const { data: partner, isPending, isError, error } = useQuery({
        queryKey: ['partners', partnerId],
        queryFn: () => getPartnerDetail(partnerId),
        enabled: Number.isFinite(partnerId),
    });

    const { data: clients, isPending: clientsPending } = useQuery({
        queryKey: ['partners', partnerId, 'clients'],
        queryFn: () => getClientsByPartner(partnerId),
        enabled: Number.isFinite(partnerId),
    });

    const { data: reservations, isPending: reservationsPending } = useQuery({
        queryKey: ['partners', partnerId, 'reservations'],
        queryFn: () => {
            const { from, to } = wideRange();
            return getAppointments({ partnerId, dateFrom: from, dateTo: to });
        },
        enabled: Number.isFinite(partnerId),
    });

    const { data: commissions, isPending: commissionsPending } = useQuery({
        queryKey: ['partners', partnerId, 'commissions'],
        queryFn: () => getAdminPartnerCommissions({ partnerId }),
        enabled: Number.isFinite(partnerId),
    });

    if (isPending) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full rounded-md" />
            </div>
        );
    }

    if (isError || !partner) {
        return (
            <Card className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="mt-2 text-sm text-destructive">{error ? getErrorMessage(error) : 'Partenaire introuvable.'}</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/partenaires')}>
                    Retour aux partenaires
                </Button>
            </Card>
        );
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate('/partenaires')} aria-label="Retour">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-semibold tracking-tight">{partner.trade_name || partner.name}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Fiche partenaire · {partner.login_email ?? 'aucun compte'}
                    </p>
                </div>
                <Badge variant={STATUS_META[partner.status].variant}>{STATUS_META[partner.status].label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Card className="flex items-center gap-3 p-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint/[0.06] text-sm font-semibold text-accent ring-1 ring-tint/10">
                        {partner.logo_url ? (
                            <img src={partner.logo_url} alt={partner.name} className="h-full w-full object-cover" />
                        ) : (
                            getInitials(partner.trade_name || partner.name)
                        )}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{partner.contact_name ?? partner.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {[partner.phone, partner.email].filter(Boolean).join(' · ') || 'Aucune coordonnée'}
                        </p>
                    </div>
                </Card>
                <KpiTile icon={Users} label="Clients apportés" value={partner.performance.clients_count} />
                <KpiTile icon={CalendarCheck} label="Réservations" value={partner.performance.appointments_count} />
                <KpiTile
                    icon={CalendarCheck}
                    label="Réservations confirmées"
                    value={partner.performance.appointments_confirmed_count}
                />
                <KpiTile icon={Wallet2} label="CA généré" value={formatCurrency(partner.performance.revenue_generated)} />
                <KpiTile
                    icon={HandCoins}
                    label="Commission à payer"
                    value={formatCurrency(partner.performance.commission_due, { maximumFractionDigits: 2 })}
                    accent
                />
            </div>

            <Tabs defaultValue="info">
                <TabsList>
                    <TabsTrigger value="info">Informations</TabsTrigger>
                    <TabsTrigger value="clients">Clients ({clients?.length ?? 0})</TabsTrigger>
                    <TabsTrigger value="reservations">Réservations ({reservations?.length ?? 0})</TabsTrigger>
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                    <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                        <InfoBlock icon={Building2} title="Entreprise">
                            <InfoRow label="Nom commercial" value={partner.trade_name} />
                            <InfoRow label="Raison sociale" value={partner.legal_name} />
                            <InfoRow label="ICE" value={partner.ice} />
                            <InfoRow label="Adresse" value={[partner.address, partner.city, partner.country].filter(Boolean).join(', ') || null} />
                        </InfoBlock>
                        <InfoBlock icon={IdCard} title="Compte">
                            <InfoRow label="Email de connexion" value={partner.login_email} />
                            <InfoRow label="Statut" value={STATUS_META[partner.status].label} />
                            <InfoRow label="Inscrit le" value={partner.created_at ? formatDate(partner.created_at) : null} />
                        </InfoBlock>
                        <InfoBlock icon={Banknote} title="Informations de paiement">
                            <InfoRow label="Titulaire" value={partner.payment_holder_name} />
                            <InfoRow label="Banque" value={partner.payment_bank_name} />
                            <InfoRow label="RIB / IBAN" value={partner.payment_iban} />
                            <InfoRow label="Méthode préférée" value={partner.payment_method_preference} />
                        </InfoBlock>
                    </Card>
                </TabsContent>

                <TabsContent value="clients">
                    <Card className="overflow-hidden">
                        {clientsPending ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <Skeleton key={index} className="h-12 w-full rounded-md" />
                                ))}
                            </div>
                        ) : !clients || clients.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun client apporté.</p>
                        ) : (
                            <ul className="divide-y divide-tint/[0.06]">
                                {clients.map((client) => (
                                    <li key={client.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                        <span className="font-medium">{client.name}</span>
                                        <span className="text-xs text-muted-foreground">{client.phone ?? '—'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="reservations">
                    <Card className="overflow-hidden">
                        {reservationsPending ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <Skeleton key={index} className="h-12 w-full rounded-md" />
                                ))}
                            </div>
                        ) : !reservations || reservations.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune réservation.</p>
                        ) : (
                            <ul className="divide-y divide-tint/[0.06]">
                                {reservations.map((appointment) => (
                                    <li key={appointment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                        <span className="font-medium">{appointment.client?.name ?? '—'}</span>
                                        <span className="text-xs text-muted-foreground">{appointment.service?.name}</span>
                                        <span className="text-xs text-muted-foreground">{formatDate(appointment.starts_at)}</span>
                                        <Badge variant="outline">{appointment.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="commissions">
                    <Card className="overflow-hidden">
                        {commissionsPending ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <Skeleton key={index} className="h-12 w-full rounded-md" />
                                ))}
                            </div>
                        ) : !commissions || commissions.data.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                                Aucune commission validée en attente de paiement.
                            </p>
                        ) : (
                            <ul className="divide-y divide-tint/[0.06]">
                                {commissions.data.map((row) => (
                                    <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                                        <span className="font-medium">{row.client_name ?? '—'}</span>
                                        <span className="text-xs text-muted-foreground">{row.service_name}</span>
                                        <span className="font-semibold text-accent">
                                            {formatCurrency(row.amount, { maximumFractionDigits: 2 })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </motion.div>
    );
}

function KpiTile({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof Users;
    label: string;
    value: string | number;
    accent?: boolean;
}) {
    return (
        <Card className="p-4">
            <span
                className={
                    'mb-2 flex h-7 w-7 items-center justify-center rounded-md ' +
                    (accent ? 'bg-accent/[0.14] text-accent' : 'bg-tint/[0.06] text-muted-foreground')
                }
            >
                <Icon className="h-3.5 w-3.5" />
            </span>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        </Card>
    );
}

function InfoBlock({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: ReactNode }) {
    return (
        <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {title}
            </h2>
            <div className="mt-3 space-y-2">{children}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value || '—'}</span>
        </div>
    );
}
