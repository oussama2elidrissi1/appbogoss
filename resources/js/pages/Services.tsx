import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Boxes,
    Clock,
    Loader2,
    Package,
    Pencil,
    Plus,
    Power,
    Search,
    Sparkles,
    Trash2,
} from 'lucide-react';
import {
    createProduct,
    createService,
    deleteProduct,
    deleteService,
    getErrorMessage,
    getProducts,
    getServices,
    updateProduct,
    updateService,
} from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { useI18n } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import type { Product, ProductPayload, Service, ServicePayload } from '@/types/workday';
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
import { CATEGORIES, getCategoryLabel } from '@/components/workday/categories';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

const catalogCategories = CATEGORIES.filter(
    (category) => category.usesServiceCatalog && category.value !== 'vitrine',
);

const categoryColors: Record<string, string> = {
    coiffure: '#C8A24C',
    hammam: '#4C7CC8',
    massage: '#8C6BC8',
};

const emptyServiceForm = {
    name: '',
    category: 'coiffure',
    price: '',
    duration_minutes: '30',
    color: '#C8A24C',
    is_active: true,
};

const emptyProductForm = {
    name: '',
    sku: '',
    category: 'vitrine',
    stock_area: 'vitrine' as 'vitrine' | 'refrigerateur',
    price: '',
    cost: '',
    stock_quantity: '0',
    low_stock_threshold: '5',
};

type Mode = 'services' | 'products';
type ServiceFormState = typeof emptyServiceForm;
type ProductFormState = typeof emptyProductForm;

function serviceToForm(service: Service): ServiceFormState {
    return {
        name: service.name,
        category: service.category,
        price: String(service.price),
        duration_minutes: String(service.duration_minutes),
        color: service.color,
        is_active: service.is_active,
    };
}

function productToForm(product: Product): ProductFormState {
    return {
        name: product.name,
        sku: product.sku,
        category: product.category,
        stock_area: product.stock_area,
        price: String(product.price),
        cost: String(product.cost),
        stock_quantity: String(product.stock_quantity),
        low_stock_threshold: String(product.low_stock_threshold),
    };
}

function servicePayload(form: ServiceFormState): ServicePayload {
    return {
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price.replace(',', '.')),
        duration_minutes: Number(form.duration_minutes),
        color: form.color,
        is_active: form.is_active,
    };
}

function productPayload(form: ProductFormState): ProductPayload {
    return {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || 'vitrine',
        stock_area: form.stock_area,
        price: Number(form.price.replace(',', '.')),
        cost: form.cost.trim() === '' ? null : Number(form.cost.replace(',', '.')),
        stock_quantity: Number(form.stock_quantity),
        low_stock_threshold: Number(form.low_stock_threshold),
    };
}

export default function Services() {
    const queryClient = useQueryClient();
    const { t } = useI18n();

    const [mode, setMode] = useState<Mode>('services');
    const [serviceCategory, setServiceCategory] = useState('coiffure');
    const [serviceSearch, setServiceSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');

    const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
    const [productDialogOpen, setProductDialogOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [serviceForm, setServiceForm] = useState<ServiceFormState>(emptyServiceForm);
    const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingService, setDeletingService] = useState<Service | null>(null);
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

    const serviceQuery = useQuery({
        queryKey: [...workDayKeys.services('admin'), serviceCategory, serviceSearch],
        queryFn: () =>
            getServices({
                category: serviceCategory,
                includeInactive: true,
                search: serviceSearch.trim() || undefined,
            }),
    });

    const productQuery = useQuery({
        queryKey: workDayKeys.products(productSearch),
        queryFn: () => getProducts({ search: productSearch.trim() || undefined }),
    });

    const services = serviceQuery.data ?? [];
    const products = productQuery.data ?? [];

    const activeServicesCount = useMemo(
        () => services.filter((service) => service.is_active).length,
        [services],
    );
    const lowStockCount = useMemo(
        () => products.filter((product) => product.stock_quantity <= product.low_stock_threshold).length,
        [products],
    );

    const refreshServices = () => {
        void queryClient.invalidateQueries({ queryKey: ['services'] });
        void queryClient.invalidateQueries({ queryKey: workDayKeys.services(serviceCategory) });
    };

    const refreshProducts = () => {
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const createServiceMutation = useMutation({
        mutationFn: createService,
        onSuccess: () => {
            refreshServices();
            closeServiceDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const updateServiceMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: ServicePayload }) =>
            updateService(id, payload),
        onSuccess: () => {
            refreshServices();
            closeServiceDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const deleteServiceMutation = useMutation({
        mutationFn: deleteService,
        onSuccess: refreshServices,
    });

    const statusMutation = useMutation({
        mutationFn: (service: Service) =>
            updateService(service.id, { is_active: !service.is_active }),
        onSuccess: refreshServices,
    });

    const createProductMutation = useMutation({
        mutationFn: createProduct,
        onSuccess: () => {
            refreshProducts();
            closeProductDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const updateProductMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: ProductPayload }) =>
            updateProduct(id, payload),
        onSuccess: () => {
            refreshProducts();
            closeProductDialog();
        },
        onError: (error) => setFormError(getErrorMessage(error)),
    });

    const deleteProductMutation = useMutation({
        mutationFn: deleteProduct,
        onSuccess: refreshProducts,
    });

    function openCreateServiceDialog() {
        setEditingService(null);
        setServiceForm({
            ...emptyServiceForm,
            category: serviceCategory,
            color: categoryColors[serviceCategory] ?? emptyServiceForm.color,
        });
        setFormError(null);
        setServiceDialogOpen(true);
    }

    function openEditServiceDialog(service: Service) {
        setEditingService(service);
        setServiceForm(serviceToForm(service));
        setFormError(null);
        setServiceDialogOpen(true);
    }

    function closeServiceDialog() {
        setServiceDialogOpen(false);
        setEditingService(null);
        setServiceForm(emptyServiceForm);
        setFormError(null);
    }

    function openCreateProductDialog() {
        setEditingProduct(null);
        setProductForm(emptyProductForm);
        setFormError(null);
        setProductDialogOpen(true);
    }

    function openEditProductDialog(product: Product) {
        setEditingProduct(product);
        setProductForm(productToForm(product));
        setFormError(null);
        setProductDialogOpen(true);
    }

    function closeProductDialog() {
        setProductDialogOpen(false);
        setEditingProduct(null);
        setProductForm(emptyProductForm);
        setFormError(null);
    }

    function submitService(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        const payload = servicePayload(serviceForm);
        if (!payload.name || !payload.category) {
            setFormError('Le nom et la catégorie sont obligatoires.');
            return;
        }
        if (!Number.isFinite(payload.price) || (payload.price ?? 0) < 0) {
            setFormError('Le prix doit être valide.');
            return;
        }
        if (!Number.isInteger(payload.duration_minutes) || (payload.duration_minutes ?? 0) < 1) {
            setFormError('La durée doit être supérieure à 0 minute.');
            return;
        }

        if (editingService) {
            updateServiceMutation.mutate({ id: editingService.id, payload });
        } else {
            createServiceMutation.mutate(payload);
        }
    }

    function submitProduct(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        const payload = productPayload(productForm);
        if (!payload.name || !payload.category) {
            setFormError('Le nom et la catégorie sont obligatoires.');
            return;
        }
        if (!Number.isFinite(payload.price) || (payload.price ?? 0) < 0) {
            setFormError('Le prix doit être valide.');
            return;
        }
        if (!Number.isFinite(payload.cost ?? 0) || (payload.cost ?? 0) < 0) {
            setFormError('Le coût doit être valide.');
            return;
        }
        if (!Number.isInteger(payload.stock_quantity) || (payload.stock_quantity ?? 0) < 0) {
            setFormError('Le stock doit être valide.');
            return;
        }
        if (!Number.isInteger(payload.low_stock_threshold) || (payload.low_stock_threshold ?? 0) < 0) {
            setFormError('Le seuil doit être valide.');
            return;
        }

        if (editingProduct) {
            updateProductMutation.mutate({ id: editingProduct.id, payload });
        } else {
            createProductMutation.mutate(payload);
        }
    }

    function handleDeleteService(service: Service) {
        setDeletingService(service);
    }

    function confirmDeleteService() {
        if (!deletingService) return;
        deleteServiceMutation.mutate(deletingService.id, { onSuccess: () => setDeletingService(null) });
    }

    function handleDeleteProduct(product: Product) {
        setDeletingProduct(product);
    }

    function confirmDeleteProduct() {
        if (!deletingProduct) return;
        deleteProductMutation.mutate(deletingProduct.id, { onSuccess: () => setDeletingProduct(null) });
    }

    const serviceSaving = createServiceMutation.isPending || updateServiceMutation.isPending;
    const productSaving = createProductMutation.isPending || updateProductMutation.isPending;
    const activeSearch = mode === 'services' ? serviceSearch : productSearch;
    const setActiveSearch = mode === 'services' ? setServiceSearch : setProductSearch;

    return (
        <>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
                <motion.div
                    variants={item}
                    className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
                >
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Services</h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Prestations et produits disponibles dans la caisse.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                value={activeSearch}
                                onChange={(event) => setActiveSearch(event.target.value)}
                                placeholder={
                                    mode === 'services'
                                        ? 'Rechercher une prestation...'
                                        : 'Rechercher un produit...'
                                }
                                className="pl-10"
                            />
                        </div>
                        <Button
                            variant="accent"
                            onClick={
                                mode === 'services'
                                    ? openCreateServiceDialog
                                    : openCreateProductDialog
                            }
                        >
                            <Plus />
                            Ajouter
                        </Button>
                    </div>
                </motion.div>

                <motion.div variants={item} className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setMode('services')}
                        className={cn(
                            'inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-all duration-200',
                            mode === 'services'
                                ? 'border-accent/50 bg-accent/[0.12] text-accent'
                                : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                        )}
                    >
                        <Sparkles className="h-4 w-4" />
                        Prestations
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('products')}
                        className={cn(
                            'inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-all duration-200',
                            mode === 'products'
                                ? 'border-accent/50 bg-accent/[0.12] text-accent'
                                : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                        )}
                    >
                        <Package className="h-4 w-4" />
                        Produits
                    </button>
                </motion.div>

                {mode === 'services' ? (
                    <>
                        <motion.div variants={item} className="flex flex-wrap gap-2">
                            {catalogCategories.map((config) => {
                                const Icon = config.icon;
                                const selected = serviceCategory === config.value;

                                return (
                                    <button
                                        key={config.value}
                                        type="button"
                                        onClick={() => setServiceCategory(config.value)}
                                        className={cn(
                                            'inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-all duration-200',
                                            selected
                                                ? 'border-accent/50 bg-accent/[0.12] text-accent'
                                                : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {config.label}
                                    </button>
                                );
                            })}
                        </motion.div>

                        <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Stat label="Total" value={services.length} />
                            <Stat label="Actifs" value={activeServicesCount} tone="success" />
                            <Stat label="Catégorie" text={getCategoryLabel(serviceCategory)} />
                        </motion.div>

                        {serviceQuery.isError ? (
                            <ErrorCard
                                title="Impossible de charger les services"
                                message={getErrorMessage(serviceQuery.error)}
                                onRetry={() => void serviceQuery.refetch()}
                            />
                        ) : serviceQuery.isPending ? (
                            <LoadingGrid />
                        ) : services.length === 0 ? (
                            <EmptyState
                                icon={Sparkles}
                                title="Aucun service"
                                description="Ajoutez une prestation pour la rendre disponible dans la caisse."
                            />
                        ) : (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {services.map((service) => (
                                    <motion.div key={service.id} variants={item} layout>
                                        <Card
                                            className={cn(
                                                'p-5 transition-colors duration-200 hover:border-accent/20',
                                                !service.is_active && 'opacity-75',
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span
                                                    className="mt-0.5 h-10 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: service.color }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <h3 className="truncate text-sm font-semibold text-foreground">
                                                                {service.name}
                                                            </h3>
                                                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Clock className="h-3.5 w-3.5" />
                                                                {service.duration_minutes} min
                                                            </p>
                                                        </div>
                                                        <p className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                            {formatCurrency(service.price, {
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </p>
                                                    </div>

                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        <Badge variant="outline">
                                                            {getCategoryLabel(service.category)}
                                                        </Badge>
                                                        <Badge
                                                            variant={
                                                                service.is_active ? 'success' : 'outline'
                                                            }
                                                        >
                                                            {service.is_active ? 'Actif' : 'Inactif'}
                                                        </Badge>
                                                    </div>

                                                    <div className="mt-5 flex items-center justify-end gap-1">
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label="Modifier"
                                                            onClick={() => openEditServiceDialog(service)}
                                                        >
                                                            <Pencil />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label={
                                                                service.is_active
                                                                    ? 'Désactiver'
                                                                    : 'Activer'
                                                            }
                                                            disabled={statusMutation.isPending}
                                                            onClick={() => statusMutation.mutate(service)}
                                                        >
                                                            <Power />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label="Supprimer"
                                                            disabled={deleteServiceMutation.isPending}
                                                            onClick={() => handleDeleteService(service)}
                                                        >
                                                            <Trash2 className="text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Stat label="Produits" value={products.length} />
                            <Stat label="Stock faible" value={lowStockCount} tone="destructive" />
                            <Stat
                                label="Valeur stock"
                                text={formatCurrency(
                                    products.reduce(
                                        (sum, product) =>
                                            sum + product.price * product.stock_quantity,
                                        0,
                                    ),
                                    { maximumFractionDigits: 2 },
                                )}
                            />
                        </motion.div>

                        {productQuery.isError ? (
                            <ErrorCard
                                title="Impossible de charger les produits"
                                message={getErrorMessage(productQuery.error)}
                                onRetry={() => void productQuery.refetch()}
                            />
                        ) : productQuery.isPending ? (
                            <LoadingGrid />
                        ) : products.length === 0 ? (
                            <EmptyState
                                icon={Boxes}
                                title="Aucun produit"
                                description="Ajoutez les produits vendus en vitrine pour les retrouver dans la caisse."
                            />
                        ) : (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {products.map((product) => {
                                    const lowStock =
                                        product.stock_quantity <= product.low_stock_threshold;

                                    return (
                                        <motion.div key={product.id} variants={item} layout>
                                            <Card className="p-5 transition-colors duration-200 hover:border-accent/20">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="truncate text-sm font-semibold text-foreground">
                                                            {product.name}
                                                        </h3>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {product.sku} · {product.category}
                                                        </p>
                                                    </div>
                                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                                                        {formatCurrency(product.price, {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </p>
                                                </div>

                                                <div className="mt-4 grid grid-cols-2 gap-2">
                                                    <Badge
                                                        variant={lowStock ? 'destructive' : 'success'}
                                                        className="justify-center"
                                                    >
                                                        Stock {product.stock_quantity}
                                                    </Badge>
                                                    <Badge variant="outline" className="justify-center">
                                                        Seuil {product.low_stock_threshold}
                                                    </Badge>
                                                </div>

                                                <div className="mt-3 text-xs text-muted-foreground">
                                                    Coût {formatCurrency(product.cost, { maximumFractionDigits: 2 })}
                                                </div>

                                                <div className="mt-5 flex items-center justify-end gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Modifier"
                                                        onClick={() => openEditProductDialog(product)}
                                                    >
                                                        <Pencil />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        aria-label="Supprimer"
                                                        disabled={deleteProductMutation.isPending}
                                                        onClick={() => handleDeleteProduct(product)}
                                                    >
                                                        <Trash2 className="text-destructive" />
                                                    </Button>
                                                </div>
                                            </Card>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </motion.div>

            <ServiceDialog
                open={serviceDialogOpen}
                editing={editingService}
                form={serviceForm}
                setForm={setServiceForm}
                error={formError}
                saving={serviceSaving}
                onClose={closeServiceDialog}
                onSubmit={submitService}
            />

            <ProductDialog
                open={productDialogOpen}
                editing={editingProduct}
                form={productForm}
                setForm={setProductForm}
                error={formError}
                saving={productSaving}
                onClose={closeProductDialog}
                onSubmit={submitProduct}
            />

            <ConfirmDialog
                open={deletingService !== null}
                onOpenChange={(open) => { if (!open) setDeletingService(null); }}
                title="Supprimer cette prestation ?"
                description={deletingService ? `${deletingService.name} sera définitivement supprimée.` : undefined}
                confirmLabel="Supprimer"
                loading={deleteServiceMutation.isPending}
                onConfirm={confirmDeleteService}
            />

            <ConfirmDialog
                open={deletingProduct !== null}
                onOpenChange={(open) => { if (!open) setDeletingProduct(null); }}
                title="Supprimer cet article ?"
                description={deletingProduct ? `${deletingProduct.name} sera définitivement supprimé du catalogue.` : undefined}
                confirmLabel="Supprimer"
                loading={deleteProductMutation.isPending}
                onConfirm={confirmDeleteProduct}
            />
        </>
    );
}

function Stat({
    label,
    value,
    text,
    tone = 'default',
}: {
    label: string;
    value?: number;
    text?: string;
    tone?: 'default' | 'success' | 'destructive';
}) {
    return (
        <Card className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
                className={cn(
                    'mt-1 text-xl font-semibold tabular-nums',
                    tone === 'success' && 'text-success',
                    tone === 'destructive' && 'text-destructive',
                    tone === 'default' && 'text-foreground',
                )}
            >
                {text ?? value}
            </p>
        </Card>
    );
}

function LoadingGrid() {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="p-5">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="mt-3 h-4 w-1/2" />
                    <Skeleton className="mt-5 h-10 w-full" />
                </Card>
            ))}
        </div>
    );
}

function ErrorCard({
    title,
    message,
    onRetry,
}: {
    title: string;
    message: string;
    onRetry: () => void;
}) {
    return (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                <AlertCircle className="h-5 w-5 text-destructive" />
            </span>
            <h2 className="mt-4 text-base font-semibold">{title}</h2>
            <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                {message}
            </p>
            <Button variant="accent" className="mt-6" onClick={onRetry}>
                Réessayer
            </Button>
        </Card>
    );
}

function ServiceDialog({
    open,
    editing,
    form,
    setForm,
    error,
    saving,
    onClose,
    onSubmit,
}: {
    open: boolean;
    editing: Service | null;
    form: ServiceFormState;
    setForm: Dispatch<SetStateAction<ServiceFormState>>;
    error: string | null;
    saving: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Modifier le service' : 'Nouveau service'}</DialogTitle>
                    <DialogDescription>
                        Les services actifs apparaissent dans la caisse selon leur catégorie.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="service-name">Nom</Label>
                        <Input
                            id="service-name"
                            value={form.name}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Coupe cheveux + barbe"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Catégorie</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {catalogCategories.map((config) => {
                                const Icon = config.icon;
                                const selected = form.category === config.value;

                                return (
                                    <button
                                        key={config.value}
                                        type="button"
                                        onClick={() =>
                                            setForm((current) => ({
                                                ...current,
                                                category: config.value,
                                                color: categoryColors[config.value] ?? current.color,
                                            }))
                                        }
                                        className={cn(
                                            'flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-all duration-200',
                                            selected
                                                ? 'border-accent/50 bg-accent/[0.12] text-accent'
                                                : 'border-tint/[0.08] bg-tint/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {config.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                            id="service-price"
                            label="Prix MAD"
                            value={form.price}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, price: value }))
                            }
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="70"
                        />
                        <Field
                            id="service-duration"
                            label="Durée minutes"
                            value={form.duration_minutes}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, duration_minutes: value }))
                            }
                            type="number"
                            step="1"
                            min="1"
                            placeholder="30"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="service-color">Couleur</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="service-color"
                                type="color"
                                value={form.color}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, color: event.target.value }))
                                }
                                className="h-10 w-16 p-1"
                            />
                            <span className="text-sm text-muted-foreground">{form.color}</span>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-3">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    is_active: event.target.checked,
                                }))
                            }
                            className="h-4 w-4 accent-accent"
                        />
                        <span className="text-sm font-medium text-foreground">Service actif</span>
                    </label>

                    <FormError error={error} />

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button type="submit" variant="accent" disabled={saving}>
                            {saving && <Loader2 className="animate-spin" />}
                            {editing ? 'Enregistrer' : 'Créer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ProductDialog({
    open,
    editing,
    form,
    setForm,
    error,
    saving,
    onClose,
    onSubmit,
}: {
    open: boolean;
    editing: Product | null;
    form: ProductFormState;
    setForm: Dispatch<SetStateAction<ProductFormState>>;
    error: string | null;
    saving: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? null : onClose())}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
                    <DialogDescription>
                        Les produits apparaissent dans la catégorie Vente de la caisse.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                            id="product-name"
                            label="Nom"
                            value={form.name}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, name: value }))
                            }
                            placeholder="Shampooing argan"
                        />
                        <Field
                            id="product-sku"
                            label="SKU"
                            value={form.sku}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, sku: value }))
                            }
                            placeholder="Auto si vide"
                            required={false}
                        />
                        <Field
                            id="product-category"
                            label="Catégorie"
                            value={form.category}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, category: value }))
                            }
                            placeholder="vitrine"
                        />
                        <div className="space-y-2">
                            <Label htmlFor="product-stock-area">Emplacement du stock</Label>
                            <select
                                id="product-stock-area"
                                value={form.stock_area}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        stock_area: event.target.value as ProductFormState['stock_area'],
                                    }))
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-tint/[0.03] px-3 text-sm text-foreground outline-none focus:border-accent/60"
                            >
                                <option value="vitrine">Vitrine</option>
                                <option value="refrigerateur">Réfrigérateur</option>
                            </select>
                        </div>
                        <Field
                            id="product-price"
                            label="Prix MAD"
                            value={form.price}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, price: value }))
                            }
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="90"
                        />
                        <Field
                            id="product-cost"
                            label="Coût MAD"
                            value={form.cost}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, cost: value }))
                            }
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="45"
                            required={false}
                        />
                        <Field
                            id="product-stock"
                            label="Stock"
                            value={form.stock_quantity}
                            onChange={(value) =>
                                setForm((current) => ({ ...current, stock_quantity: value }))
                            }
                            type="number"
                            step="1"
                            min="0"
                            placeholder="10"
                        />
                        <Field
                            id="product-threshold"
                            label="Seuil alerte"
                            value={form.low_stock_threshold}
                            onChange={(value) =>
                                setForm((current) => ({
                                    ...current,
                                    low_stock_threshold: value,
                                }))
                            }
                            type="number"
                            step="1"
                            min="0"
                            placeholder="5"
                        />
                    </div>

                    <FormError error={error} />

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button type="submit" variant="accent" disabled={saving}>
                            {saving && <Loader2 className="animate-spin" />}
                            {editing ? 'Enregistrer' : 'Créer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    type = 'text',
    step,
    min,
    placeholder,
    required = true,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    step?: string;
    min?: string;
    placeholder?: string;
    required?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                step={step}
                min={min}
                inputMode={type === 'number' ? 'decimal' : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                required={required}
            />
        </div>
    );
}

function FormError({ error }: { error: string | null }) {
    if (!error) return null;

    return (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
        </div>
    );
}
