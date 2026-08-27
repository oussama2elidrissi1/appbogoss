import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    AlertTriangle,
    Minus,
    PackageOpen,
    Pencil,
    Plus,
    Refrigerator,
    Search,
    Trash2,
    Warehouse,
} from 'lucide-react';
import { createProduct, deleteProduct, getErrorMessage, getProducts, updateProduct } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import { pageFade } from '@/lib/motion';
import type { Product, ProductPayload } from '@/types/workday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';

type StockArea = 'vitrine' | 'refrigerateur';
type ProductForm = {
    name: string;
    sku: string;
    category: string;
    stock_area: StockArea;
    price: string;
    cost: string;
    stock_quantity: string;
    low_stock_threshold: string;
};

const emptyForm = (area: StockArea): ProductForm => ({
    name: '',
    sku: '',
    category: area === 'refrigerateur' ? 'boisson' : 'vitrine',
    stock_area: area,
    price: '',
    cost: '',
    stock_quantity: '0',
    low_stock_threshold: '5',
});

const areas: Array<{
    value: StockArea;
    label: string;
    description: string;
    icon: typeof Warehouse;
}> = [
    {
        value: 'vitrine',
        label: 'Vitrine',
        description: 'Produits et articles vendus depuis la vitrine.',
        icon: Warehouse,
    },
    {
        value: 'refrigerateur',
        label: 'Réfrigérateur',
        description: 'Boissons, eaux et snacks comme Twix.',
        icon: Refrigerator,
    },
];

function toForm(product: Product): ProductForm {
    return {
        name: product.name,
        sku: product.sku,
        category: product.category,
        stock_area: product.stock_area ?? 'vitrine',
        price: String(product.price),
        cost: String(product.cost),
        stock_quantity: String(product.stock_quantity),
        low_stock_threshold: String(product.low_stock_threshold),
    };
}

function toPayload(form: ProductForm): ProductPayload {
    return {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || form.stock_area,
        stock_area: form.stock_area,
        price: Number(form.price.replace(',', '.')),
        cost: form.cost.trim() === '' ? null : Number(form.cost.replace(',', '.')),
        stock_quantity: Number(form.stock_quantity),
        low_stock_threshold: Number(form.low_stock_threshold),
    };
}

export default function Stock() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [area, setArea] = useState<StockArea>('vitrine');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Product | null>(null);
    const [form, setForm] = useState<ProductForm>(() => emptyForm('vitrine'));
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

    const query = useQuery({
        queryKey: ['products', 'stock', area, search],
        queryFn: () => getProducts({ search: search.trim() || undefined, stockArea: area }),
    });
    const products = query.data ?? [];

    const stats = useMemo(() => ({
        products: products.length,
        units: products.reduce((sum, product) => sum + product.stock_quantity, 0),
        value: products.reduce((sum, product) => sum + product.price * product.stock_quantity, 0),
        low: products.filter((product) => product.stock_quantity <= product.low_stock_threshold).length,
    }), [products]);

    function refresh() {
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    const createMutation = useMutation({ mutationFn: createProduct, onSuccess: () => { refresh(); closeDialog(); }, onError: (error) => setFormError(getErrorMessage(error)) });
    const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: ProductPayload }) => updateProduct(id, payload), onSuccess: () => { refresh(); closeDialog(); }, onError: (error) => setFormError(getErrorMessage(error)) });
    const deleteMutation = useMutation({ mutationFn: deleteProduct, onSuccess: refresh });
    const saving = createMutation.isPending || updateMutation.isPending;

    function openCreate() {
        setEditing(null);
        setForm(emptyForm(area));
        setFormError(null);
        setDialogOpen(true);
    }

    function openEdit(product: Product) {
        setEditing(product);
        setForm(toForm(product));
        setFormError(null);
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm(area));
        setFormError(null);
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);
        const payload = toPayload(form);
        if (!payload.name) return setFormError(t('Le nom du produit est obligatoire.'));
        if (!Number.isFinite(payload.price) || (payload.price ?? 0) < 0) return setFormError(t('Le prix doit être valide.'));
        if (!Number.isFinite(payload.cost ?? 0) || (payload.cost ?? 0) < 0) return setFormError(t('Le coût doit être valide.'));
        if (!Number.isInteger(payload.stock_quantity) || (payload.stock_quantity ?? 0) < 0) return setFormError(t('La quantité doit être un entier positif.'));
        if (!Number.isInteger(payload.low_stock_threshold) || (payload.low_stock_threshold ?? 0) < 0) return setFormError(t('Le seuil doit être un entier positif.'));

        if (editing) updateMutation.mutate({ id: editing.id, payload });
        else createMutation.mutate(payload);
    }

    function adjust(product: Product, delta: number) {
        const nextQuantity = Math.max(0, product.stock_quantity + delta);
        updateMutation.mutate({ id: product.id, payload: { stock_quantity: nextQuantity } });
    }

    function remove(product: Product) {
        setDeletingProduct(product);
    }

    function confirmRemove() {
        if (!deletingProduct) return;
        deleteMutation.mutate(deletingProduct.id, { onSuccess: () => setDeletingProduct(null) });
    }

    const currentArea = areas.find((entry) => entry.value === area) ?? areas[0];
    const AreaIcon = currentArea.icon;

    return <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Stock')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{t('Gérez séparément la vitrine et le réfrigérateur reliés à la caisse.')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Rechercher un produit...')} className="pl-10" /></div>
                <Button variant="accent" onClick={openCreate}><Plus /> {t('Ajouter un produit')}</Button>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {areas.map((entry) => { const Icon = entry.icon; return <button key={entry.value} type="button" onClick={() => setArea(entry.value)} className={cn('rounded-lg border p-4 text-left transition-colors', area === entry.value ? 'border-accent/60 bg-accent/[0.10]' : 'border-tint/[0.08] bg-tint/[0.025] hover:border-accent/30')}><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-tint/[0.06] text-accent"><Icon className="h-5 w-5" /></span><span><span className="block text-sm font-semibold">{t(entry.label)}</span><span className="block text-xs text-muted-foreground">{t(entry.description)}</span></span></span></button>; })}
        </div>

        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><AreaIcon className="h-5 w-5 text-accent" /><div><h3 className="font-semibold">{t('Stock')} {t(currentArea.label)}</h3><p className="text-xs text-muted-foreground">{t(currentArea.description)}</p></div></div><Badge variant="outline">{products.length} {t(products.length > 1 ? 'produits' : 'produit')}</Badge></div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t('Produits')} value={stats.products} /><Stat label={t('Unités')} value={stats.units} /><Stat label={t('Valeur de vente')} value={formatCurrency(stats.value, { maximumFractionDigits: 2 })} /><Stat label={t('Stock faible')} value={stats.low} alert={stats.low > 0} /></div>

        {query.isError ? <Card className="flex flex-col items-center justify-center px-6 py-16 text-center"><AlertCircle className="h-6 w-6 text-destructive" /><h3 className="mt-4 font-semibold">{t('Impossible de charger le stock')}</h3><p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(query.error)}</p><Button className="mt-5" variant="accent" onClick={() => void query.refetch()}>{t('Réessayer')}</Button></Card> : query.isPending ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Card key={index} className="p-5"><Skeleton className="h-28 w-full" /></Card>)}</div> : products.length === 0 ? <EmptyState icon={PackageOpen} title={t('Aucun produit dans cet espace')} description={t('Ajoutez un produit pour le rendre disponible dans la caisse et suivre sa quantité.')} /> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => { const low = product.stock_quantity <= product.low_stock_threshold; return <Card key={product.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.category} · {product.sku}</p></div><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t('Modifier le produit')} onClick={() => openEdit(product)}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={t('Supprimer le produit')} onClick={() => remove(product)}><Trash2 className="text-destructive" /></Button></div></div><div className="mt-5 flex items-end justify-between"><div><p className="text-xs text-muted-foreground">{t('Quantité disponible')}</p><p className={cn('mt-1 text-3xl font-semibold tabular-nums', low ? 'text-destructive' : 'text-foreground')}>{product.stock_quantity}</p></div><Badge variant={low ? 'destructive' : 'success'}>{low ? <><AlertTriangle className="mr-1 h-3 w-3" /> {t('Stock faible')}</> : t('Disponible')}</Badge></div><div className="mt-4 flex items-center justify-between rounded-md border border-tint/[0.08] bg-tint/[0.025] p-1"><Button size="icon" variant="ghost" aria-label={t('Diminuer le stock')} disabled={product.stock_quantity === 0 || updateMutation.isPending} onClick={() => adjust(product, -1)}><Minus /></Button><span className="text-xs text-muted-foreground">{t('Ajuster la quantité')}</span><Button size="icon" variant="ghost" aria-label={t('Augmenter le stock')} disabled={updateMutation.isPending} onClick={() => adjust(product, 1)}><Plus /></Button></div><div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>{t('Seuil :')} {product.low_stock_threshold}</span><span className="font-semibold text-accent">{formatCurrency(product.price, { maximumFractionDigits: 2 })}</span></div></Card>; })}</div>}

        <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing ? t('Modifier le produit') : t('Ajouter un produit')}</DialogTitle><DialogDescription>{t('Le produit sera disponible dans l’espace sélectionné et dans la caisse correspondante.')}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field id="stock-product-name" label={t('Nom')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder={area === 'refrigerateur' ? t('Eau 50cl ou Twix') : t('Produit vitrine')} /><Field id="stock-product-sku" label={t('SKU')} value={form.sku} onChange={(value) => setForm({ ...form, sku: value })} placeholder={t('Auto si vide')} /><Field id="stock-product-category" label={t('Catégorie')} value={form.category} onChange={(value) => setForm({ ...form, category: value })} placeholder={area === 'refrigerateur' ? t('boisson ou snack') : t('vitrine')} /><div className="space-y-2"><Label htmlFor="stock-product-area">{t('Emplacement')}</Label><select id="stock-product-area" value={form.stock_area} onChange={(event) => setForm({ ...form, stock_area: event.target.value as StockArea })} className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"><option value="vitrine">{t('Vitrine')}</option><option value="refrigerateur">{t('Réfrigérateur')}</option></select></div><Field id="stock-product-price" label={t('Prix MAD')} value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" step="0.01" min="0" placeholder="10" /><Field id="stock-product-cost" label={t('Coût MAD')} value={form.cost} onChange={(value) => setForm({ ...form, cost: value })} type="number" step="0.01" min="0" placeholder="5" /><Field id="stock-product-quantity" label={t('Quantité initiale')} value={form.stock_quantity} onChange={(value) => setForm({ ...form, stock_quantity: value })} type="number" step="1" min="0" placeholder="20" /><Field id="stock-product-threshold" label={t('Seuil d’alerte')} value={form.low_stock_threshold} onChange={(value) => setForm({ ...form, low_stock_threshold: value })} type="number" step="1" min="0" placeholder="5" /></div>{formError && <p className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>{t('Annuler')}</Button><Button type="submit" variant="accent" disabled={saving}>{saving ? t('Enregistrement...') : editing ? t('Enregistrer') : t('Créer le produit')}</Button></DialogFooter></form></DialogContent></Dialog>

        <ConfirmDialog open={deletingProduct !== null} onOpenChange={(open) => { if (!open) setDeletingProduct(null); }} title={t('Supprimer ce produit ?')} description={deletingProduct ? t('{name} sera définitivement retiré du stock.', { name: deletingProduct.name }) : undefined} confirmLabel={t('Supprimer')} loading={deleteMutation.isPending} onConfirm={confirmRemove} />
    </motion.div>;
}

function Stat({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
    return <Card className="px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-xl font-semibold tabular-nums', alert ? 'text-destructive' : 'text-foreground')}>{value}</p></Card>;
}

function Field({ id, label, value, onChange, type = 'text', step, min, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; min?: string; placeholder?: string }) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} type={type} step={step} min={min} placeholder={placeholder} /></div>;
}
