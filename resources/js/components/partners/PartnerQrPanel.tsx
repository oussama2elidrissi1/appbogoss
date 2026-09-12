import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
    ArrowDown,
    ArrowUp,
    Copy,
    Download,
    ExternalLink,
    Image as ImageIcon,
    Loader2,
    Plus,
    RefreshCw,
    Star,
    Trash2,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
    createPartnerOffering,
    deletePartnerOffering,
    getOfferingCatalog,
    getPartnerLandingSettings,
    getPartnerOfferings,
    getPartnerQrBookings,
    getPartnerQrStats,
    getPartnerQrToken,
    regeneratePartnerQrToken,
    reorderPartnerOfferings,
    revokePartnerQrToken,
    updatePartnerLandingSettings,
    updatePartnerOffering,
    type PartnerOffering,
} from '@/lib/partnerQrApi';
import { downloadPartnerPoster, downloadPartnerQr } from '@/lib/partnerPoster';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * L'ADMINISTRATION DU QR D'UN PARTENAIRE, en trois blocs :
 *
 *  - le QR lui-même (lien, téléchargements, régénération, aperçu) ;
 *  - sa vitrine — quels services et quels packs il montre, et comment ;
 *  - l'habillage de sa page et ses chiffres.
 *
 * Tout est scopé au `partnerId` reçu : aucune requête d'ici ne peut toucher
 * la vitrine d'un autre partenaire, et le serveur le revérifie de son côté.
 */
export function PartnerQrPanel({ partnerId, partnerName }: { partnerId: number; partnerName: string }) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [qrImage, setQrImage] = useState<string | null>(null);
    const [busyPoster, setBusyPoster] = useState(false);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState(false);

    const tokenQuery = useQuery({
        queryKey: ['partner-qr', partnerId, 'token'],
        queryFn: () => getPartnerQrToken(partnerId),
    });
    const statsQuery = useQuery({
        queryKey: ['partner-qr', partnerId, 'stats'],
        queryFn: () => getPartnerQrStats(partnerId),
    });
    const offeringsQuery = useQuery({
        queryKey: ['partner-qr', partnerId, 'offerings'],
        queryFn: () => getPartnerOfferings(partnerId),
    });
    const bookingsQuery = useQuery({
        queryKey: ['partner-qr', partnerId, 'bookings'],
        queryFn: () => getPartnerQrBookings(partnerId),
    });

    const url = tokenQuery.data?.url ?? '';

    useEffect(() => {
        if (!url) return;
        void QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 1, width: 420 }).then(setQrImage);
    }, [url]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['partner-qr', partnerId] });
    }

    const regenerate = useMutation({
        mutationFn: () => regeneratePartnerQrToken(partnerId),
        onSuccess: () => {
            setError(null);
            invalidate();
        },
        onError: (err) => setError(getErrorMessage(err)),
    });

    const revoke = useMutation({
        mutationFn: () => revokePartnerQrToken(partnerId),
        onSuccess: () => {
            setError(null);
            invalidate();
        },
        onError: (err) => setError(getErrorMessage(err)),
    });

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError(t('Le lien n’a pas pu être copié.'));
        }
    }

    async function poster(kind: 'poster' | 'qr') {
        setBusyPoster(true);
        setError(null);
        try {
            if (kind === 'poster') await downloadPartnerPoster(url, partnerName);
            else await downloadPartnerQr(url, partnerName);
        } catch (err) {
            setError(getErrorMessage(err, t('L’affiche n’a pas pu être générée.')));
        } finally {
            setBusyPoster(false);
        }
    }

    return (
        <div className="space-y-4">
            {error && (
                <p className="rounded-md border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-sm text-destructive">
                    {error}
                </p>
            )}

            {/* ------------------------------------------------------ le QR */}
            <Card className="grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-3">
                    {tokenQuery.isPending ? (
                        <Skeleton className="h-[200px] w-[200px] rounded-md" />
                    ) : qrImage ? (
                        <img
                            src={qrImage}
                            alt={t('QR Code partenaire')}
                            className="h-[200px] w-[200px] rounded-md bg-white p-2"
                        />
                    ) : (
                        <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md border border-dashed border-tint/[0.15] text-xs text-muted-foreground">
                            {t('Aucun QR actif')}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold">{t('QR Code partenaire')}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t(
                                'L’affiche est la même pour tous les partenaires — seul ce QR change. Il n’expose jamais l’identifiant du partenaire.',
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3 py-2">
                        <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url || '—'}</code>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink()} disabled={!url}>
                            <Copy className="h-3.5 w-3.5" />
                            {copied ? t('Copié') : t('Copier')}
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="accent" disabled={!url || busyPoster} onClick={() => void poster('poster')}>
                            {busyPoster ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                            {t('Télécharger l’affiche partenaire')}
                        </Button>
                        <Button type="button" variant="outline" disabled={!url} onClick={() => void poster('qr')}>
                            <Download className="h-4 w-4" />
                            {t('QR seul (PNG)')}
                        </Button>
                        <Button type="button" variant="outline" asChild disabled={!url}>
                            <a href={url || '#'} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                {t('Aperçu de la page')}
                            </a>
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setConfirmRegenerate(true)}>
                            <RefreshCw className="h-4 w-4" />
                            {t('Régénérer')}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setConfirmRevoke(true)}>
                            {t('Révoquer')}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* -------------------------------------------------- les chiffres */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
                <StatTile label={t('Visites QR')} value={`${statsQuery.data?.visits ?? 0}`} />
                <StatTile label={t('Réservations')} value={`${statsQuery.data?.bookings ?? 0}`} />
                <StatTile label={t('Confirmées')} value={`${statsQuery.data?.confirmed_bookings ?? 0}`} />
                <StatTile label={t('CA généré')} value={formatCurrency(statsQuery.data?.revenue_total ?? 0)} />
                <StatTile label={t('Commission')} value={formatCurrency(statsQuery.data?.commission_total ?? 0)} accent />
                <StatTile label={t('Conversion')} value={`${statsQuery.data?.conversion_rate ?? 0} %`} />
            </div>

            {/* ------------------------------------------------------ vitrine */}
            <OfferingsEditor
                partnerId={partnerId}
                offerings={offeringsQuery.data ?? []}
                pending={offeringsQuery.isPending}
                onChanged={invalidate}
                onError={setError}
            />

            {/* --------------------------------------------------------- page */}
            <LandingEditor partnerId={partnerId} onError={setError} />

            {/* ------------------------------------------- réservations du QR */}
            <Card className="overflow-hidden">
                <div className="border-b border-tint/[0.06] px-4 py-3">
                    <h3 className="text-sm font-semibold">{t('Réservations issues du QR')}</h3>
                </div>
                {bookingsQuery.isPending ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="h-10 w-full rounded-md" />
                        ))}
                    </div>
                ) : (bookingsQuery.data ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                        {t('Aucune réservation issue de ce QR pour le moment.')}
                    </p>
                ) : (
                    <div className="divide-y divide-tint/[0.06]">
                        {(bookingsQuery.data ?? []).map((row) => (
                            <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                <span className="w-36 shrink-0 tabular-nums text-muted-foreground">{row.starts_at}</span>
                                <span className="min-w-0 flex-1 truncate">{row.client_name ?? t('Client')}</span>
                                <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                                    {row.service_name}
                                </span>
                                <Badge variant="outline">{t(row.status)}</Badge>
                                <span className="w-24 shrink-0 text-right tabular-nums">
                                    {formatCurrency(row.total ?? 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <ConfirmDialog
                open={confirmRegenerate}
                onOpenChange={setConfirmRegenerate}
                title={t('Régénérer le QR ?')}
                description={t(
                    'Les affiches déjà imprimées cesseront d’attribuer les réservations. Les réservations passées ne changent pas.',
                )}
                confirmLabel={t('Régénérer')}
                onConfirm={() => regenerate.mutate()}
            />
            <ConfirmDialog
                open={confirmRevoke}
                onOpenChange={setConfirmRevoke}
                title={t('Révoquer le QR ?')}
                description={t(
                    'La page publique de ce partenaire devient inaccessible et plus aucune réservation ne lui sera attribuée.',
                )}
                confirmLabel={t('Révoquer')}
                onConfirm={() => revoke.mutate()}
            />
        </div>
    );
}

// ----------------------------------------------------------------- vitrine

function OfferingsEditor({
    partnerId,
    offerings,
    pending,
    onChanged,
    onError,
}: {
    partnerId: number;
    offerings: PartnerOffering[];
    pending: boolean;
    onChanged: () => void;
    onError: (message: string | null) => void;
}) {
    const { t } = useI18n();
    const [kind, setKind] = useState<'service' | 'pack'>('service');
    const [targetId, setTargetId] = useState<string>('');
    const [editing, setEditing] = useState<PartnerOffering | null>(null);

    const catalog = useQuery({ queryKey: ['partner-qr', 'catalog'], queryFn: getOfferingCatalog });

    const available = useMemo(() => {
        const taken = new Set(
            offerings
                .filter((offering) => offering.kind === kind)
                .map((offering) => (kind === 'service' ? offering.service_id : offering.service_pack_id)),
        );
        const source = kind === 'service' ? (catalog.data?.services ?? []) : (catalog.data?.packs ?? []);
        return source.filter((item) => !taken.has(item.id));
    }, [catalog.data, offerings, kind]);

    const add = useMutation({
        mutationFn: () =>
            createPartnerOffering(partnerId, {
                kind,
                ...(kind === 'service' ? { service_id: Number(targetId) } : { service_pack_id: Number(targetId) }),
            }),
        onSuccess: () => {
            setTargetId('');
            onError(null);
            onChanged();
        },
        onError: (err) => onError(getErrorMessage(err)),
    });

    const patch = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
            updatePartnerOffering(partnerId, id, payload),
        onSuccess: () => {
            onError(null);
            onChanged();
        },
        onError: (err) => onError(getErrorMessage(err)),
    });

    const remove = useMutation({
        mutationFn: (id: number) => deletePartnerOffering(partnerId, id),
        onSuccess: () => {
            onError(null);
            onChanged();
        },
        onError: (err) => onError(getErrorMessage(err)),
    });

    const reorder = useMutation({
        mutationFn: (ids: number[]) => reorderPartnerOfferings(partnerId, ids),
        onSuccess: onChanged,
        onError: (err) => onError(getErrorMessage(err)),
    });

    function move(index: number, direction: -1 | 1) {
        const next = [...offerings];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        reorder.mutate(next.map((offering) => offering.id));
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-2 border-b border-tint/[0.06] px-4 py-3">
                <div>
                    <h3 className="text-sm font-semibold">{t('Offres QR')}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('Ce que ce partenaire affiche après le scan. Les autres partenaires ne changent pas.')}
                    </p>
                </div>
                <div className="ml-auto flex flex-wrap items-end gap-2">
                    <div className="flex gap-1.5">
                        <Chip size="sm" selected={kind === 'service'} onClick={() => setKind('service')}>
                            {t('Service')}
                        </Chip>
                        <Chip size="sm" selected={kind === 'pack'} onClick={() => setKind('pack')}>
                            {t('Pack')}
                        </Chip>
                    </div>
                    <Select value={targetId} onValueChange={setTargetId}>
                        <SelectTrigger className="h-9 w-56">
                            <SelectValue placeholder={t('Choisir…')} />
                        </SelectTrigger>
                        <SelectContent>
                            {available.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                    {item.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        disabled={targetId === '' || add.isPending}
                        onClick={() => add.mutate()}
                    >
                        <Plus className="h-4 w-4" />
                        {t('Ajouter')}
                    </Button>
                </div>
            </div>

            {pending ? (
                <div className="space-y-2 p-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full rounded-md" />
                    ))}
                </div>
            ) : offerings.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                    {t('Aucune offre : la page de ce partenaire sera vide.')}
                </p>
            ) : (
                <div className="divide-y divide-tint/[0.06]">
                    {offerings.map((offering, index) => (
                        <div key={offering.id} className="space-y-2 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={offering.kind === 'pack' ? 'accent' : 'outline'}>
                                    {t(offering.kind === 'pack' ? 'Pack' : 'Service')}
                                </Badge>
                                <span className={cn('text-sm font-medium', !offering.is_active && 'opacity-50')}>
                                    {offering.title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatCurrency(offering.effective_price)} · {offering.duration_minutes} min
                                </span>
                                {offering.custom_commission_type && (
                                    <Badge variant="success">
                                        {t('Commission')} {offering.custom_commission_value}
                                        {offering.custom_commission_type === 'percentage' ? ' %' : ' DH'}
                                    </Badge>
                                )}

                                <div className="ml-auto flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('Monter')}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('Descendre')}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('Mettre en avant')}
                                        onClick={() =>
                                            patch.mutate({
                                                id: offering.id,
                                                payload: { is_featured: !offering.is_featured },
                                            })
                                        }
                                    >
                                        <Star
                                            className={cn(
                                                'h-3.5 w-3.5',
                                                offering.is_featured && 'fill-accent text-accent',
                                            )}
                                        />
                                    </Button>
                                    <Chip
                                        size="sm"
                                        selected={offering.is_active}
                                        onClick={() =>
                                            patch.mutate({
                                                id: offering.id,
                                                payload: { is_active: !offering.is_active },
                                            })
                                        }
                                    >
                                        {t(offering.is_active ? 'Visible' : 'Masquée')}
                                    </Chip>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditing(editing?.id === offering.id ? null : offering)}
                                    >
                                        {t('Personnaliser')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('Retirer')}
                                        onClick={() => remove.mutate(offering.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                </div>
                            </div>

                            {editing?.id === offering.id && (
                                <OfferingForm
                                    offering={offering}
                                    onSubmit={(payload) => {
                                        patch.mutate({ id: offering.id, payload });
                                        setEditing(null);
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function OfferingForm({
    offering,
    onSubmit,
}: {
    offering: PartnerOffering;
    onSubmit: (payload: Record<string, unknown>) => void;
}) {
    const { t } = useI18n();
    const [form, setForm] = useState({
        custom_title: offering.custom_title ?? '',
        custom_description: offering.custom_description ?? '',
        custom_price: offering.custom_price !== null ? String(offering.custom_price) : '',
        custom_commission_type: offering.custom_commission_type ?? '',
        custom_commission_value:
            offering.custom_commission_value !== null ? String(offering.custom_commission_value) : '',
        available_from: offering.available_from ?? '',
        available_until: offering.available_until ?? '',
    });

    return (
        <div className="grid gap-3 rounded-md border border-tint/[0.08] bg-tint/[0.02] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Labelled label={t('Titre affiché')}>
                <Input
                    value={form.custom_title}
                    onChange={(event) => setForm({ ...form, custom_title: event.target.value })}
                    placeholder={offering.catalog_name ?? ''}
                />
            </Labelled>
            <Labelled label={t('Prix spécifique')}>
                <Input
                    type="number"
                    step="0.01"
                    value={form.custom_price}
                    onChange={(event) => setForm({ ...form, custom_price: event.target.value })}
                    placeholder={offering.catalog_price !== null ? String(offering.catalog_price) : ''}
                />
            </Labelled>
            <Labelled label={t('Commission spécifique')}>
                <div className="flex gap-1.5">
                    <Select
                        value={form.custom_commission_type}
                        onValueChange={(value) => setForm({ ...form, custom_commission_type: value })}
                    >
                        <SelectTrigger className="h-9 w-28">
                            <SelectValue placeholder={t('Type')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="fixed">DH</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        step="0.01"
                        value={form.custom_commission_value}
                        onChange={(event) => setForm({ ...form, custom_commission_value: event.target.value })}
                    />
                </div>
            </Labelled>
            <Labelled label={t('Description affichée')}>
                <Input
                    value={form.custom_description}
                    onChange={(event) => setForm({ ...form, custom_description: event.target.value })}
                />
            </Labelled>
            <Labelled label={t('Visible à partir du')}>
                <Input
                    type="date"
                    value={form.available_from}
                    onChange={(event) => setForm({ ...form, available_from: event.target.value })}
                />
            </Labelled>
            <Labelled label={t('Visible jusqu’au')}>
                <Input
                    type="date"
                    value={form.available_until}
                    onChange={(event) => setForm({ ...form, available_until: event.target.value })}
                />
            </Labelled>

            <div className="flex items-end lg:col-span-2">
                <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={() =>
                        onSubmit({
                            custom_title: form.custom_title.trim() || null,
                            custom_description: form.custom_description.trim() || null,
                            custom_price: form.custom_price === '' ? null : Number(form.custom_price),
                            custom_commission_type: form.custom_commission_type || null,
                            custom_commission_value:
                                form.custom_commission_value === '' ? null : Number(form.custom_commission_value),
                            available_from: form.available_from || null,
                            available_until: form.available_until || null,
                        })
                    }
                >
                    {t('Enregistrer')}
                </Button>
            </div>
        </div>
    );
}

// -------------------------------------------------------------------- page

function LandingEditor({
    partnerId,
    onError,
}: {
    partnerId: number;
    onError: (message: string | null) => void;
}) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const { data, isPending } = useQuery({
        queryKey: ['partner-qr', partnerId, 'landing'],
        queryFn: () => getPartnerLandingSettings(partnerId),
    });

    const [form, setForm] = useState({ title: '', subtitle: '', intro: '', cover_image_url: '' });

    useEffect(() => {
        if (!data) return;
        setForm({
            title: data.title ?? '',
            subtitle: data.subtitle ?? '',
            intro: data.intro ?? '',
            cover_image_url: data.cover_image_url ?? '',
        });
    }, [data]);

    const save = useMutation({
        mutationFn: (payload: Record<string, unknown>) => updatePartnerLandingSettings(partnerId, payload),
        onSuccess: () => {
            onError(null);
            void queryClient.invalidateQueries({ queryKey: ['partner-qr', partnerId, 'landing'] });
        },
        onError: (err) => onError(getErrorMessage(err)),
    });

    if (isPending) return <Skeleton className="h-40 w-full rounded-md" />;

    return (
        <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{t('Page QR')}</h3>
                <Chip
                    size="sm"
                    selected={data?.is_enabled ?? true}
                    onClick={() => save.mutate({ is_enabled: !(data?.is_enabled ?? true) })}
                >
                    {t(data?.is_enabled ?? true ? 'Page activée' : 'Page désactivée')}
                </Chip>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Labelled label={t('Titre')}>
                    <Input
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        placeholder="BOGOS LAND"
                    />
                </Labelled>
                <Labelled label={t('Sous-titre')}>
                    <Input
                        value={form.subtitle}
                        onChange={(event) => setForm({ ...form, subtitle: event.target.value })}
                        placeholder="Barbershop & Hammam Turc"
                    />
                </Labelled>
                <Labelled label={t('Texte d’accueil')}>
                    <Input
                        value={form.intro}
                        onChange={(event) => setForm({ ...form, intro: event.target.value })}
                        placeholder={t('Prenez soin de vous.')}
                    />
                </Labelled>
                <Labelled label={t('Image de couverture (URL)')}>
                    <Input
                        value={form.cover_image_url}
                        onChange={(event) => setForm({ ...form, cover_image_url: event.target.value })}
                    />
                </Labelled>
            </div>

            <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() =>
                    save.mutate({
                        title: form.title.trim() || null,
                        subtitle: form.subtitle.trim() || null,
                        intro: form.intro.trim() || null,
                        cover_image_url: form.cover_image_url.trim() || null,
                    })
                }
            >
                {t('Enregistrer')}
            </Button>
        </Card>
    );
}

// ------------------------------------------------------------------ atomes

function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
                className={cn(
                    'mt-1 text-lg font-bold tabular-nums',
                    accent ? 'text-accent' : 'text-foreground',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="space-y-1.5">
            <Label>{label}</Label>
            {children}
        </label>
    );
}
