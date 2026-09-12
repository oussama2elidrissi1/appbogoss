import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { getOwnPartnerQr, getOwnPartnerQrBookings } from '@/lib/partnerQrApi';
import { downloadPartnerPoster, downloadPartnerQr } from '@/lib/partnerPoster';
import { useI18n } from '@/lib/i18n';
import { pageFade } from '@/lib/motion';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * L'ESPACE QR DU PARTENAIRE — son affiche, ses chiffres, ses réservations.
 *
 * Lecture seule. Le partenaire télécharge son affiche et suit ce qu'elle
 * rapporte ; la composition de sa vitrine reste au Super Admin, comme le
 * reste du catalogue Bogosland.
 *
 * Aucun appel d'ici ne porte d'identifiant de partenaire : le serveur lit le
 * compte connecté. Il n'y a donc rien à modifier dans la page pour voir les
 * chiffres d'un confrère.
 */
export default function PartnerQr() {
    const { t } = useI18n();
    const [qrImage, setQrImage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data, isPending } = useQuery({ queryKey: ['partner-own-qr'], queryFn: getOwnPartnerQr });
    const bookings = useQuery({ queryKey: ['partner-own-qr', 'bookings'], queryFn: getOwnPartnerQrBookings });

    const url = data?.url ?? '';

    useEffect(() => {
        if (!url) return;
        void QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 1, width: 420 }).then(setQrImage);
    }, [url]);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError(t('Le lien n’a pas pu être copié.'));
        }
    }

    async function download(kind: 'poster' | 'qr') {
        setBusy(true);
        setError(null);
        try {
            if (kind === 'poster') await downloadPartnerPoster(url, 'partenaire');
            else await downloadPartnerQr(url, 'partenaire');
        } catch (err) {
            setError(getErrorMessage(err, t('L’affiche n’a pas pu être générée.')));
        } finally {
            setBusy(false);
        }
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4">
            <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Mon QR Code')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('Affichez-le chez vous : chaque réservation issue d’un scan vous est attribuée.')}
                </p>
            </div>

            {error && (
                <p className="rounded-md border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-sm text-destructive">
                    {error}
                </p>
            )}

            <Card className="grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex justify-center">
                    {isPending ? (
                        <Skeleton className="h-[200px] w-[200px] rounded-md" />
                    ) : qrImage ? (
                        <img src={qrImage} alt={t('Mon QR Code')} className="h-[200px] w-[200px] rounded-md bg-white p-2" />
                    ) : null}
                </div>

                <div className="space-y-3">
                    {data && !data.landing_enabled && (
                        <p className="rounded-md border border-tint/[0.1] bg-tint/[0.03] px-3 py-2 text-xs text-muted-foreground">
                            {t('Votre page n’est pas publiée actuellement. Contactez le salon.')}
                        </p>
                    )}

                    <div className="flex items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3 py-2">
                        <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url || '—'}</code>
                        <Button type="button" variant="ghost" size="sm" disabled={!url} onClick={() => void copyLink()}>
                            <Copy className="h-3.5 w-3.5" />
                            {copied ? t('Copié') : t('Copier')}
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="accent" disabled={!url || busy} onClick={() => void download('poster')}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                            {t('Télécharger l’affiche')}
                        </Button>
                        <Button type="button" variant="outline" disabled={!url} onClick={() => void download('qr')}>
                            <Download className="h-4 w-4" />
                            {t('QR seul (PNG)')}
                        </Button>
                        <Button type="button" variant="outline" asChild disabled={!url}>
                            <a href={url || '#'} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                {t('Voir ma page')}
                            </a>
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
                <Tile label={t('Visites QR')} value={`${data?.stats.visits ?? 0}`} />
                <Tile label={t('Réservations')} value={`${data?.stats.bookings ?? 0}`} />
                <Tile label={t('Confirmées')} value={`${data?.stats.confirmed_bookings ?? 0}`} />
                <Tile label={t('CA généré')} value={formatCurrency(data?.stats.revenue_total ?? 0)} />
                <Tile label={t('Commission')} value={formatCurrency(data?.stats.commission_total ?? 0)} accent />
                <Tile label={t('Conversion')} value={`${data?.stats.conversion_rate ?? 0} %`} />
            </div>

            <Card className="overflow-hidden">
                <div className="border-b border-tint/[0.06] px-4 py-3">
                    <h3 className="text-sm font-semibold">{t('Réservations issues de mon QR')}</h3>
                </div>
                {bookings.isPending ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-10 w-full rounded-md" />
                        ))}
                    </div>
                ) : (bookings.data ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                        {t('Aucune réservation issue de votre QR pour le moment.')}
                    </p>
                ) : (
                    <div className="divide-y divide-tint/[0.06]">
                        {(bookings.data ?? []).map((row) => (
                            <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                <span className="w-36 shrink-0 tabular-nums text-muted-foreground">{row.starts_at}</span>
                                <span className="min-w-0 flex-1 truncate">{row.client_name ?? t('Client')}</span>
                                <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                                    {row.service_name}
                                </span>
                                <Badge variant="outline">{t(row.status)}</Badge>
                                <span className="w-24 shrink-0 text-right tabular-nums text-accent">
                                    {formatCurrency(row.commission_earned ?? 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </motion.div>
    );
}

function Tile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', accent ? 'text-accent' : 'text-foreground')}>
                {value}
            </p>
        </div>
    );
}
