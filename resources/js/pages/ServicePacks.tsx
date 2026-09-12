import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Boxes, Loader2, Plus, Trash2 } from 'lucide-react';
import { getErrorMessage, getServices } from '@/lib/api';
import {
    createServicePack,
    deleteServicePack,
    getServicePacks,
    updateServicePack,
    type ServicePack,
} from '@/lib/partnerQrApi';
import { useI18n } from '@/lib/i18n';
import { pageFade } from '@/lib/motion';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * LES PACKS — « Coupe + Barbe + Soin, 250 DH ».
 *
 * Un pack assemble des prestations du CATALOGUE : il ne les recopie pas. On
 * y choisit donc des services existants, et le prix du pack est le seul
 * chiffre propre au pack.
 *
 * Un pack déjà proposé par un partenaire n'est pas supprimé mais archivé —
 * sinon une offre disparaîtrait sous les pieds d'une réservation en cours.
 */
export default function ServicePacks() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<ServicePack | null>(null);
    const [creating, setCreating] = useState(false);
    const [removing, setRemoving] = useState<ServicePack | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data: packs, isPending } = useQuery({ queryKey: ['service-packs'], queryFn: () => getServicePacks() });

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['service-packs'] });
        void queryClient.invalidateQueries({ queryKey: ['partner-qr', 'catalog'] });
    }

    const toggle = useMutation({
        mutationFn: (pack: ServicePack) => updateServicePack(pack.id, { is_active: !pack.is_active }),
        onSuccess: invalidate,
        onError: (err) => setError(getErrorMessage(err)),
    });

    const remove = useMutation({
        mutationFn: (pack: ServicePack) => deleteServicePack(pack.id),
        onSuccess: () => {
            setRemoving(null);
            invalidate();
        },
        onError: (err) => setError(getErrorMessage(err)),
    });

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight">{t('Packs')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('Assemblages de prestations du catalogue, proposés aux partenaires sur leur page QR.')}
                    </p>
                </div>
                <Button type="button" variant="accent" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" />
                    {t('Nouveau pack')}
                </Button>
            </div>

            {error && (
                <p className="rounded-md border border-destructive/25 bg-destructive/[0.08] px-3 py-2 text-sm text-destructive">
                    {error}
                </p>
            )}

            {isPending ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-40 w-full rounded-md" />
                    ))}
                </div>
            ) : (packs ?? []).length === 0 ? (
                <Card className="flex flex-col items-center gap-3 p-10 text-center">
                    <Boxes className="h-8 w-8 text-accent" />
                    <p className="text-sm text-muted-foreground">
                        {t('Aucun pack pour l’instant. Créez-en un pour le proposer à vos partenaires.')}
                    </p>
                </Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(packs ?? []).map((pack) => (
                        <Card key={pack.id} className={cn('space-y-3 p-4', !pack.is_active && 'opacity-60')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold">{pack.name}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {pack.duration_minutes} {t('min')} · {pack.items.length}{' '}
                                        {t(pack.items.length > 1 ? 'prestations' : 'prestation')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold tabular-nums text-accent">
                                        {formatCurrency(pack.effective_price)}
                                    </p>
                                    {pack.promotional_price !== null && (
                                        <p className="text-xs tabular-nums text-muted-foreground line-through">
                                            {formatCurrency(pack.price)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {pack.description && (
                                <p className="line-clamp-2 text-xs text-muted-foreground">{pack.description}</p>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                                {pack.items.map((item) => (
                                    <Badge key={item.id} variant="outline">
                                        {item.service_name}
                                        {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                                    </Badge>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5">
                                <Chip size="sm" selected={pack.is_active} onClick={() => toggle.mutate(pack)}>
                                    {t(pack.is_active ? 'Actif' : 'Inactif')}
                                </Chip>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(pack)}>
                                    {t('Modifier')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="ml-auto"
                                    aria-label={t('Supprimer')}
                                    onClick={() => setRemoving(pack)}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <PackDialog
                open={creating || editing !== null}
                pack={editing}
                onClose={() => {
                    setCreating(false);
                    setEditing(null);
                }}
                onSaved={() => {
                    setCreating(false);
                    setEditing(null);
                    invalidate();
                }}
                onError={setError}
            />

            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={t('Supprimer ce pack ?')}
                description={t(
                    'Un pack déjà proposé à un partenaire est archivé plutôt que supprimé, pour ne pas effacer l’historique.',
                )}
                confirmLabel={t('Supprimer')}
                variant="destructive"
                loading={remove.isPending}
                onConfirm={() => removing && remove.mutate(removing)}
            />
        </motion.div>
    );
}

function PackDialog({
    open,
    pack,
    onClose,
    onSaved,
    onError,
}: {
    open: boolean;
    pack: ServicePack | null;
    onClose: () => void;
    onSaved: () => void;
    onError: (message: string | null) => void;
}) {
    const { t } = useI18n();
    const { data: services } = useQuery({
        queryKey: ['services', 'packs'],
        queryFn: () => getServices(),
        staleTime: 5 * 60_000,
    });

    const [form, setForm] = useState({ name: '', description: '', price: '', promotional_price: '' });
    const [picked, setPicked] = useState<number[]>([]);
    const [hydrated, setHydrated] = useState<number | null>(null);

    // Hydrate une seule fois par pack ouvert : retaper le formulaire à chaque
    // rendu écraserait la saisie en cours.
    if (open && hydrated !== (pack?.id ?? 0)) {
        setHydrated(pack?.id ?? 0);
        setForm({
            name: pack?.name ?? '',
            description: pack?.description ?? '',
            price: pack !== null ? String(pack.price) : '',
            promotional_price: pack?.promotional_price !== null && pack ? String(pack.promotional_price) : '',
        });
        setPicked(pack?.items.map((item) => item.service_id) ?? []);
    }

    const cataloguePrice = useMemo(
        () =>
            (services ?? [])
                .filter((service) => picked.includes(service.id))
                .reduce((sum, service) => sum + Number(service.price), 0),
        [services, picked],
    );

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                price: Number(form.price),
                promotional_price: form.promotional_price === '' ? null : Number(form.promotional_price),
                items: picked.map((serviceId) => ({ service_id: serviceId })),
            };
            return pack ? updateServicePack(pack.id, payload) : createServicePack(payload);
        },
        onSuccess: () => {
            onError(null);
            setHydrated(null);
            onSaved();
        },
        onError: (err) => onError(getErrorMessage(err)),
    });

    const ready = form.name.trim() !== '' && form.price !== '' && picked.length > 0;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setHydrated(null);
                    onClose();
                }
            }}
        >
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{pack ? t('Modifier le pack') : t('Nouveau pack')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <label className="space-y-1.5">
                        <Label>{t('Nom')}</Label>
                        <Input
                            value={form.name}
                            onChange={(event) => setForm({ ...form, name: event.target.value })}
                            placeholder={t('Pack Premium')}
                        />
                    </label>
                    <label className="space-y-1.5">
                        <Label>{t('Description')}</Label>
                        <Input
                            value={form.description}
                            onChange={(event) => setForm({ ...form, description: event.target.value })}
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                            <Label>{t('Prix')}</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={form.price}
                                onChange={(event) => setForm({ ...form, price: event.target.value })}
                            />
                        </label>
                        <label className="space-y-1.5">
                            <Label>{t('Prix promotionnel')}</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={form.promotional_price}
                                onChange={(event) => setForm({ ...form, promotional_price: event.target.value })}
                            />
                        </label>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('Prestations incluses')}</Label>
                        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-tint/[0.08] p-2">
                            {(services ?? []).map((service) => (
                                <Chip
                                    key={service.id}
                                    size="sm"
                                    selected={picked.includes(service.id)}
                                    onClick={() =>
                                        setPicked(
                                            picked.includes(service.id)
                                                ? picked.filter((id) => id !== service.id)
                                                : [...picked, service.id],
                                        )
                                    }
                                >
                                    {service.name}
                                </Chip>
                            ))}
                        </div>
                        {picked.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {t('Valeur au catalogue : {amount}', { amount: formatCurrency(cataloguePrice) })}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('Annuler')}
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            disabled={!ready || save.isPending}
                            onClick={() => save.mutate()}
                        >
                            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t('Enregistrer')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
