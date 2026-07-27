import {
    BarChart3,
    Calendar,
    LayoutDashboard,
    Megaphone,
    Package,
    Receipt,
    Settings,
    ShoppingCart,
    Sparkles,
    Users,
    UserSquare2,
    type LucideIcon,
} from 'lucide-react';

export interface NavItem {
    label: string;
    to: string;
    icon: LucideIcon;
    /** One-line copy reused by the placeholder screens. */
    description: string;
}

export interface NavSection {
    heading: string;
    items: NavItem[];
}

export const navSections: NavSection[] = [
    {
        heading: 'Pilotage',
        items: [
            {
                label: 'Dashboard',
                to: '/dashboard',
                icon: LayoutDashboard,
                description: "Vue d'ensemble de l'activité du salon en temps réel.",
            },
            {
                label: 'Agenda',
                to: '/agenda',
                icon: Calendar,
                description: 'Planifiez et visualisez les rendez-vous de toute votre équipe.',
            },
        ],
    },
    {
        heading: 'Gestion',
        items: [
            {
                label: 'Clients',
                to: '/clients',
                icon: Users,
                description: 'Fiches clients, historique des visites et préférences.',
            },
            {
                label: 'Employés',
                to: '/employees',
                icon: UserSquare2,
                description: 'Équipe, plannings, commissions et performances individuelles.',
            },
            {
                label: 'Services',
                to: '/services',
                icon: Sparkles,
                description: 'Catalogue des prestations, durées et tarifs.',
            },
        ],
    },
    {
        heading: 'Opérations',
        items: [
            {
                label: 'Caisse',
                to: '/pos',
                icon: ShoppingCart,
                description: 'Encaissement rapide, tickets et moyens de paiement.',
            },
            {
                label: 'Stock',
                to: '/stock',
                icon: Package,
                description: 'Inventaire produits, seuils d’alerte et réapprovisionnement.',
            },
            {
                label: 'Dépenses',
                to: '/expenses',
                icon: Receipt,
                description: 'Charges, fournisseurs et suivi budgétaire mensuel.',
            },
        ],
    },
    {
        heading: 'Croissance',
        items: [
            {
                label: 'Rapports',
                to: '/reports',
                icon: BarChart3,
                description: 'Analyses détaillées du chiffre d’affaires et de la rentabilité.',
            },
            {
                label: 'Marketing',
                to: '/marketing',
                icon: Megaphone,
                description: 'Campagnes SMS, fidélité et relance automatique des clients.',
            },
            {
                label: 'Paramètres',
                to: '/settings',
                icon: Settings,
                description: 'Configuration du salon, utilisateurs et préférences.',
            },
        ],
    },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export function getNavItemByPath(pathname: string): NavItem | undefined {
    return navItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
