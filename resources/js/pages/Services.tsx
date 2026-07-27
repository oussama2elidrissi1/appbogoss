import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Clock,
    Loader2,
    Pencil,
    Plus,
    Power,
    Search,
    Sparkles,
    Trash2,
} from 'lucide-react';
import {
    createService,
    deleteService,
    getErrorMessage,
    getServices,
    updateService,
} from '@/lib/api';
import { workDayKeys } from '@/hooks/useWorkDay';
import { cn, formatCurrency } from '@/lib/utils';
import type { Service, ServicePayload } from '@/types/workday';
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

const catalogCategories = CATEGORIES.filter((category) => category.usesServiceCatalog);

const categoryColors: Record<string, string> = {
    coiffure: '#C8A24C',
    hammam: '#4C7CC8',
    massage: '#8C6BC8',
};

const emptyForm = {
    name: '',
    category: 'coiffure',
    price: '',
    duration_minutes: '30',
    color: '#C8A24C',
    is_active: true,
};

type ServiceFormState = typeof emptyForm;

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

function formToPayload(form: ServiceFormState): ServicePayload {
    return {
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price.replace(',', '.')),
        duration_minutes: Number(form.duration_minutes),
        color: form.color,
        is_active: form.is_active,
    };
}

export default function Services() {
    const queryClient = useQueryClient();
    const [category, setCategory] = useState('coiffure');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Service | null>(null);
    const [form, setForm] = useState<ServiceFormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);

    const {
        data: services = [],
        isPending,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: [...workDayKeys.services('admin'), category, search],
        queryFn: () =>
            getServices({
                category,
                includeInactive: true,
                search: search.trim() || undefined,
            }),
    });

    const activeCount = useMemo(
        () => services.filter((service) => service.is_active).length,
        [services],
    );

    const refreshServices = () => {
        void queryClient.invalidateQueries({ queryKey: ['services'] });
        void queryClient.invalidateQueries({ queryKey: workDayKeys.services(category) });
    };

    const createMutation = useMutation({
        mutationFn: createService,
        onSuccess: () => {
            refreshServices();
            closeDialog();
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: ServicePayload }) =>
            updateService(id, payload),
        onSuccess: () => {
            refreshServices();
            closeDialog();
        },
        onError: (mutationError) => setFormError(getErrorMessage(mutationError)),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteService,
        onSuccess: refreshServices,
    });

    const statusMutation = useMutation({
        mutationFn: (service: Service) =>
            updateService(service.id, { is_active: !service.is_active }),
        onSuccess: refreshServices,
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    function openCreateDialog() {
        setEditing(null);
        setForm({
            ...emptyForm,
            category,
            color: categoryColors[category] ?? emptyForm.color,
        });
        setFormError(null);
        setDialogOpen(true);
    }

    function openEditDialog(service: Service) {
        setEditing(service);
        setForm(serviceToForm(service));
        setFormError(null);
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        const payload = formToPayload(form);
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

        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    function handleDelete(service: Service) {
        const confirmed = window.confirm(`Supprimer ${service.name} ?`);
        if (confirmed) deleteMutation.mutate(service.id);
    }

    if (isError) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/[0.12]">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Impossible de charger les services</h2>
                <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                    {getErrorMessage(error)}
                </p>
                <Button variant="accent" className="mt-6" onClick={() => void refetch()}>
                    Réessayer
                </Button>
            </Card>
        );
    }

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
                            Catalogue des prestations visibles dans la caisse.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Rechercher une prestation..."
                                className="pl-10"
                            />
                        </div>
                        <Button variant="accent" onClick={openCreateDialog}>
                            <Plus />
                            Ajouter
                        </Button>
                    </div>
                </motion.div>

                <motion.div variants={item} className="flex flex-wrap gap-2">
                    {catalogCategories.map((config) => {
                        const Icon = config.icon;
                        const selected = category === config.value;

                        return (
                            <button
                                key={config.value}
                                type="button"
                                onClick={() => setCategory(config.value)}
                                className={cn(
                                    'inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-all duration-200',
                                    selected
                                        ? 'border-accent/50 bg-accent/[0.12] text-accent'
                                        : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {config.label}
                            </button>
                        );
                    })}
                </motion.div>

                <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{services.length}</p>
                    </Card>
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Actifs</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-success">
                            {activeCount}
                        </p>
                    </Card>
                    <Card className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">Catégorie</p>
                        <p className="mt-1 text-xl font-semibold text-accent">
                            {getCategoryLabel(category)}
                        </p>
                    </Card>
                </motion.div>

                {isPending ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Card key={index} className="p-5">
                                <Skeleton className="h-5 w-2/3" />
                                <Skeleton className="mt-3 h-4 w-1/2" />
                                <Skeleton className="mt-5 h-10 w-full" />
                            </Card>
                        ))}
                    </div>
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
                                                <Badge variant={service.is_active ? 'success' : 'outline'}>
                                                    {service.is_active ? 'Actif' : 'Inactif'}
                                                </Badge>
                                            </div>

                                            <div className="mt-5 flex items-center justify-end gap-1">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label="Modifier"
                                                    onClick={() => openEditDialog(service)}
                                                >
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={
                                                        service.is_active ? 'Désactiver' : 'Activer'
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
                                                    disabled={deleteMutation.isPending}
                                                    onClick={() => handleDelete(service)}
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
            </motion.div>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (open) setDialogOpen(true);
                    else closeDialog();
                }}
            >
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Modifier le service' : 'Nouveau service'}
                        </DialogTitle>
                        <DialogDescription>
                            Les services actifs apparaissent dans la caisse selon leur catégorie.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="service-name">Nom</Label>
                            <Input
                                id="service-name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
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
                                                    : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-accent/30 hover:text-foreground',
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
                            <div className="space-y-2">
                                <Label htmlFor="service-price">Prix MAD</Label>
                                <Input
                                    id="service-price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={form.price}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            price: event.target.value,
                                        }))
                                    }
                                    placeholder="70"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="service-duration">Durée minutes</Label>
                                <Input
                                    id="service-duration"
                                    type="number"
                                    min="1"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.duration_minutes}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            duration_minutes: event.target.value,
                                        }))
                                    }
                                    placeholder="30"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="service-color">Couleur</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="service-color"
                                    type="color"
                                    value={form.color}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            color: event.target.value,
                                        }))
                                    }
                                    className="h-10 w-16 p-1"
                                />
                                <span className="text-sm text-muted-foreground">{form.color}</span>
                            </div>
                        </div>

                        <label className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        is_active: event.target.checked,
                                    }))
                                }
                                className="h-4 w-4 accent-[#C8A24C]"
                            />
                            <span className="text-sm font-medium text-foreground">Service actif</span>
                        </label>

                        {formError && (
                            <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                <p className="text-sm text-destructive">{formError}</p>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeDialog}>
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
        </>
    );
}
