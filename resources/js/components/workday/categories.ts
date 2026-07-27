import {
    Coffee,
    Hand,
    MoreHorizontal,
    Scissors,
    ShoppingBag,
    Waves,
    type LucideIcon,
} from 'lucide-react';
import type { TransactionCategory } from '@/types/workday';

export interface CategoryConfig {
    value: TransactionCategory;
    label: string;
    icon: LucideIcon;
    /** Ledger badge / chip colouring, drawn from the theme tokens. */
    chip: string;
    badge: string;
    /** Catalog categories show saved items; the rest are free-text + manual price. */
    usesServiceCatalog: boolean;
}

/**
 * Single source of truth for the six contract categories: drives the checkout
 * chips (and their 1–6 keyboard shortcuts, by index), the ledger badges and the
 * closing report's `revenue_by_category` labels.
 */
export const CATEGORIES: CategoryConfig[] = [
    {
        value: 'coiffure',
        label: 'Coiffure',
        icon: Scissors,
        chip: 'text-accent',
        badge: 'border-accent/25 bg-accent/[0.12] text-accent',
        usesServiceCatalog: true,
    },
    {
        value: 'hammam',
        label: 'Hammam',
        icon: Waves,
        chip: 'text-sky-300',
        badge: 'border-sky-400/25 bg-sky-400/[0.12] text-sky-300',
        usesServiceCatalog: true,
    },
    {
        value: 'massage',
        label: 'Massage',
        icon: Hand,
        chip: 'text-violet-300',
        badge: 'border-violet-400/25 bg-violet-400/[0.12] text-violet-300',
        usesServiceCatalog: true,
    },
    {
        value: 'boisson',
        label: 'Boisson',
        icon: Coffee,
        chip: 'text-success',
        badge: 'border-success/25 bg-success/[0.12] text-success',
        usesServiceCatalog: true,
    },
    {
        value: 'vitrine',
        label: 'Vente',
        icon: ShoppingBag,
        chip: 'text-rose-300',
        badge: 'border-rose-400/25 bg-rose-400/[0.12] text-rose-300',
        usesServiceCatalog: true,
    },
    {
        value: 'autre',
        label: 'Autre',
        icon: MoreHorizontal,
        chip: 'text-muted-foreground',
        badge: 'border-white/[0.08] bg-white/[0.06] text-muted-foreground',
        usesServiceCatalog: false,
    },
];

const BY_VALUE: Record<string, CategoryConfig> = Object.fromEntries(
    CATEGORIES.map((category) => [category.value, category]),
);

/**
 * Lookup tolerant of unknown strings — `Sale.category` and
 * `revenue_by_category[].category` arrive as raw strings from the backend.
 */
export function getCategory(value: string): CategoryConfig {
    return BY_VALUE[value] ?? BY_VALUE.autre;
}

export function getCategoryLabel(value: string): string {
    return BY_VALUE[value]?.label ?? value;
}
