import { useMemo, useState } from 'react';
import { Clock3, PenLine, Plus, Search, Sparkles } from 'lucide-react';
import { CATEGORIES, getCategory } from '@/components/workday/categories';
import { cn, formatCurrency } from '@/lib/utils';
import type { Employee, Service } from '@/types/workday';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Pos2CatalogProps {
    services: Service[];
    employees: Employee[];
    activeEmployeeId: number | null;
    onActiveEmployeeChange: (id: number | null) => void;
    /** Adds the tapped service as an invoice line (assigned to the active employee). */
    onPickService: (service: Service) => void;
    /** Free-text line (produit vitrine, supplément…). */
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

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return services.filter((service) => {
            if (category !== 'all' && service.category !== category) return false;
            if (!term) return true;
            return (
                service.name.toLowerCase().includes(term) ||
                getCategory(service.category).label.toLowerCase().includes(term)
            );
        });
    }, [services, category, search]);

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
            {/* Employé actif — chaque service tapé lui est assigné (§12). */}
            <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Employé actif
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

            {/* Grille de services (§10) */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((service) => {
                    const config = getCategory(service.category);
                    const covered = coveredServiceIds?.has(service.id) ?? false;
                    return (
                        <button
                            key={service.id}
                            type="button"
                            disabled={busy}
                            onClick={() => onPickService(service)}
                            className={cn(
                                'group relative flex min-h-[86px] flex-col justify-between rounded-md border p-3 text-left',
                                'transition-all duration-200 ease-out active:scale-[0.97]',
                                'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/40 hover:bg-tint/[0.06] hover:shadow-glow',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                                'disabled:pointer-events-none disabled:opacity-60',
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
                                {service.duration_minutes > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Clock3 className="h-3 w-3" />
                                        {service.duration_minutes} min
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}

                {/* Ligne libre — produits/vitrine, suppléments, exceptions. */}
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

            {filtered.length === 0 && (
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
