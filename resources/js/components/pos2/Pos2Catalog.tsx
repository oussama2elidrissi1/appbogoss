import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Coffee, Package, PenLine, Plus, Search, ShoppingBag, Sparkles, Users } from 'lucide-react';
import { CATEGORIES, getCategory } from '@/components/workday/categories';
import { getProducts } from '@/lib/api';
import { canPerform, eligibleEmployees } from '@/lib/pos2Eligibility';
import { cn, formatCurrency } from '@/lib/utils';
import type { Employee, Product, Service } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Onglets produits — ventes de stock, sans employé ni commission. */
const PRODUCT_TABS = [
    { value: 'produits:vitrine', area: 'vitrine' as const, label: 'Vente', icon: ShoppingBag },
    { value: 'produits:refrigerateur', area: 'refrigerateur' as const, label: 'Boisson', icon: Coffee },
];

interface Pos2CatalogProps {
    services: Service[];
    employees: Employee[];
    activeEmployeeId: number | null;
    onActiveEmployeeChange: (id: number | null) => void;
    /** Adds the tapped service as an invoice line (assigned to the active employee). */
    onPickService: (service: Service) => void;
    /** Adds a stock product line (vente vitrine / réfrigérateur) — no employee. */
    onPickProduct: (product: Product) => void;
    /** Free-text line (supplément, exception…). */
    onAddFreeLine: (label: string, price: number) => void;
    /** service_id -> subscription coverage badge. */
    coveredServiceIds?: Set<number>;
    busy: boolean;
}

/**
 * Left panel of the POS: employee-on-duty chips, category tabs, instant
 * search, and the tappable service grid. One tap on a service = one line on
 * the invoice — no modal (§7, §45).
 */
export function Pos2Catalog({
    services,
    employees,
    activeEmployeeId,
    onActiveEmployeeChange,
    onPickService,
    onPickProduct,
    onAddFreeLine,
    coveredServiceIds,
    busy,
}: Pos2CatalogProps) {
    const [category, setCategory] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [freeLineOpen, setFreeLineOpen] = useState(false);
    const [freeLabel, setFreeLabel] = useState('');
    const [freePrice, setFreePrice] = useState('');

    const presentCategories = useMemo(() => {
        const values = new Set(services.map((service) => service.category));
        return CATEGORIES.filter((config) => values.has(config.value));
    }, [services]);

    const activeEmployee = useMemo(
        () => employees.find((employee) => employee.id === activeEmployeeId) ?? null,
        [employees, activeEmployeeId],
    );

    const productTab = PRODUCT_TABS.find((tab) => tab.value === category) ?? null;
    const { data: products } = useQuery({
        queryKey: ['products', 'pos2', productTab?.area],
        queryFn: () => getProducts({ stockArea: productTab?.area }),
        enabled: productTab !== null,
        staleTime: 60_000,
    });

    const filteredProducts = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = products ?? [];
        if (!term) return list;
        return list.filter((product) => product.name.toLowerCase().includes(term));
    }, [products, search]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = services.filter((service) => {
            if (category !== 'all' && service.category !== category) return false;
            if (!term) return true;
            return (
                service.name.toLowerCase().includes(term) ||
                getCategory(service.category).label.toLowerCase().includes(term)
            );
        });
        // §17 — employé actif = accélérateur UX : ses services passent en
        // tête, les autres restent visibles (et sélectionnables) mais atténués.
        if (activeEmployee) {
            return [...list].sort(
                (a, b) => Number(canPerform(activeEmployee, b)) - Number(canPerform(activeEmployee, a)),
            );
        }
        return list;
    }, [services, category, search, activeEmployee]);

    function submitFreeLine() {
        const label = freeLabel.trim();
        const price = Number(freePrice.replace(',', '.'));
        if (!label || Number.isNaN(price) || price < 0) return;
        onAddFreeLine(label, price);
        setFreeLabel('');
        setFreePrice('');
        setFreeLineOpen(false);
    }

    return (
        <div className="space-y-4">
            {/* Employé actif = employé PAR DÉFAUT (§4) : un service tapé lui est
                pré-assigné uniquement s'il est autorisé à le réaliser. */}
            <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Employé actif <span className="normal-case tracking-normal">— pré-assigné s'il est autorisé</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                    {employees.map((employee) => (
                        <Chip
                            key={employee.id}
                            size="sm"
                            selected={activeEmployeeId === employee.id}
                            onClick={() =>
                                onActiveEmployeeChange(activeEmployeeId === employee.id ? null : employee.id)
                            }
                        >
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: employee.avatar_color }}
                            />
                            {employee.name}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Catégories (§8) */}
            <div className="flex flex-wrap gap-1.5">
                <Chip size="sm" selected={category === 'all'} onClick={() => setCategory('all')}>
                    Tous
                </Chip>
                {presentCategories.map((config) => {
                    const Icon = config.icon;
                    return (
                        <Chip
                            key={config.value}
                            size="sm"
                            selected={category === config.value}
                            onClick={() => setCategory(config.value)}
                        >
                            <Icon className={config.chip} />
                            {config.label}
                        </Chip>
                    );
                })}
                <span className="mx-0.5 h-5 w-px self-center bg-tint/[0.12]" />
                {PRODUCT_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <Chip
                            key={tab.value}
                            size="sm"
                            selected={category === tab.value}
                            onClick={() => setCategory(tab.value)}
                        >
                            <Icon className={tab.area === 'refrigerateur' ? 'text-success' : 'text-rose-600 dark:text-rose-300'} />
                            {tab.label}
                        </Chip>
                    );
                })}
            </div>

            {/* Recherche (§9) */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un service…"
                    className="pl-10"
                />
            </div>

            {/* Grille de produits — vente vitrine / réfrigérateur (stock réel). */}
            {productTab !== null ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                        const outOfStock = product.stock_quantity <= 0;
                        const lowStock = !outOfStock && product.stock_quantity <= product.low_stock_threshold;
                        return (
                            <button
                                key={product.id}
                                type="button"
                                disabled={busy || outOfStock}
                                onClick={() => onPickProduct(product)}
                                className={cn(
                                    'group relative flex min-h-[86px] flex-col justify-between rounded-md border p-3 text-left',
                                    'transition-all duration-200 ease-out active:scale-[0.97]',
                                    'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/40 hover:bg-tint/[0.06] hover:shadow-glow',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                                    'disabled:pointer-events-none disabled:opacity-45',
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                        {product.name}
                                    </p>
                                    <p className={cn(
                                        'mt-1 text-[11px] font-medium',
                                        productTab.area === 'refrigerateur' ? 'text-success' : 'text-rose-600 dark:text-rose-300',
                                    )}>
                                        {productTab.label}
                                    </p>
                                </div>
                                <div className="mt-2 flex items-end justify-between gap-2">
                                    <span className="text-sm font-semibold tabular-nums text-foreground">
                                        {formatCurrency(product.price)}
                                    </span>
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 text-[11px] tabular-nums',
                                            outOfStock
                                                ? 'font-semibold text-destructive'
                                                : lowStock
                                                  ? 'font-medium text-accent'
                                                  : 'text-muted-foreground',
                                        )}
                                    >
                                        <Package className="h-3 w-3" />
                                        {outOfStock ? 'Rupture' : `Stock ${product.stock_quantity}`}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                    {filteredProducts.length === 0 && (
                        <p className="col-span-full rounded-md border border-tint/[0.07] bg-tint/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
                            Aucun produit dans cette zone de stock.
                        </p>
                    )}
                </div>
            ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((service) => {
                    const config = getCategory(service.category);
                    const covered = coveredServiceIds?.has(service.id) ?? false;
                    const eligible = eligibleEmployees(employees, service);
                    const restricted = eligible.length < employees.length;
                    const activeIncompatible = activeEmployee !== null && !canPerform(activeEmployee, service);
                    return (
                        <button
                            key={service.id}
                            type="button"
                            disabled={busy}
                            onClick={() => onPickService(service)}
                            title={
                                restricted && eligible.length > 0
                                    ? `Réalisé par : ${eligible.map((employee) => employee.name).join(', ')}`
                                    : undefined
                            }
                            className={cn(
                                'group relative flex min-h-[86px] flex-col justify-between rounded-md border p-3 text-left',
                                'transition-all duration-200 ease-out active:scale-[0.97]',
                                'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/40 hover:bg-tint/[0.06] hover:shadow-glow',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                                'disabled:pointer-events-none disabled:opacity-60',
                                activeIncompatible && 'opacity-55 hover:opacity-100',
                            )}
                        >
                            {covered && (
                                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border border-success/30 bg-success/[0.12] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    Abo
                                </span>
                            )}
                            <div className="min-w-0 pr-8">
                                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                    {service.name}
                                </p>
                                <p className={cn('mt-1 text-[11px] font-medium', config.chip)}>{config.label}</p>
                            </div>
                            <div className="mt-2 flex items-end justify-between gap-2">
                                <span className="text-sm font-semibold tabular-nums text-foreground">
                                    {formatCurrency(service.price)}
                                </span>
                                <span className="flex items-center gap-2">
                                    {restricted && (
                                        <span
                                            className={cn(
                                                'inline-flex items-center gap-1 text-[11px]',
                                                eligible.length === 0 ? 'text-destructive' : 'text-muted-foreground',
                                            )}
                                        >
                                            <Users className="h-3 w-3" />
                                            {eligible.length}
                                        </span>
                                    )}
                                    {service.duration_minutes > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <Clock3 className="h-3 w-3" />
                                            {service.duration_minutes} min
                                        </span>
                                    )}
                                </span>
                            </div>
                        </button>
                    );
                })}

                {/* Ligne libre — suppléments, exceptions. */}
                <button
                    type="button"
                    onClick={() => setFreeLineOpen((value) => !value)}
                    className={cn(
                        'flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-3',
                        'border-tint/[0.15] text-muted-foreground transition-all duration-200',
                        'hover:border-accent/40 hover:text-foreground',
                        freeLineOpen && 'border-accent/50 text-foreground',
                    )}
                >
                    <PenLine className="h-4 w-4" />
                    <span className="text-xs font-medium">Ligne libre</span>
                </button>
            </div>
            )}

            {productTab === null && filtered.length === 0 && (
                <p className="rounded-md border border-tint/[0.07] bg-tint/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun service ne correspond à cette recherche.
                </p>
            )}

            {freeLineOpen && (
                <div className="flex flex-wrap items-end gap-2.5 rounded-md border border-accent/30 bg-accent/[0.04] p-3.5">
                    <div className="min-w-[180px] flex-1 space-y-1.5">
                        <Label htmlFor="pos2-free-label" className="text-xs">Libellé</Label>
                        <Input
                            id="pos2-free-label"
                            value={freeLabel}
                            onChange={(event) => setFreeLabel(event.target.value)}
                            placeholder="ex. Produit coiffant"
                            className="h-10"
                            autoFocus
                        />
                    </div>
                    <div className="w-28 space-y-1.5">
                        <Label htmlFor="pos2-free-price" className="text-xs">Prix (MAD)</Label>
                        <Input
                            id="pos2-free-price"
                            inputMode="decimal"
                            value={freePrice}
                            onChange={(event) => setFreePrice(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && submitFreeLine()}
                            placeholder="0"
                            className="h-10 text-right tabular-nums"
                        />
                    </div>
                    <Button type="button" variant="accent" className="h-10" disabled={busy} onClick={submitFreeLine}>
                        <Plus />
                        Ajouter
                    </Button>
                </div>
            )}
        </div>
    );
}
