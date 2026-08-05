import {
    BarChart3,
    Calendar,
    History,
    LayoutDashboard,
    Megaphone,
    Package,
    Receipt,
    Settings,
    ShieldCheck,
    ShoppingCart,
    Sparkles,
    UserCircle,
    Users,
    UserSquare2,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

export interface NavItem {
    label: string;
    to: string;
    icon: LucideIcon;
    /** One-line copy reused by the placeholder screens. */
    description: string;
    /** When set, the link is hidden for users lacking this permission. */
    permission?: string;
    /** When true, the link is shown only for accounts linked to an employee record. */
    requiresEmployee?: boolean;
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
                permission: 'reports.view_all',
            },
            {
                label: 'Mon espace',
                to: '/mon-espace',
                icon: UserCircle,
                description: 'Créez vos prestations et suivez vos commissions.',
                requiresEmployee: true,
            },
            {
                label: 'Agenda',
                to: '/agenda',
                icon: Calendar,
                description: 'Planifiez et visualisez les rendez-vous de toute votre équipe.',
                permission: 'agenda.manage',
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
                permission: 'caisse.manage',
            },
            {
                label: 'Employés',
                to: '/employees',
                icon: UserSquare2,
                description: 'Équipe, plannings, commissions et performances individuelles.',
                permission: 'employees.manage',
            },
            {
                label: 'Services',
                to: '/services',
                icon: Sparkles,
                description: 'Catalogue des prestations, durées et tarifs.',
                permission: 'services.manage',
            },
            {
                label: 'Paie',
                to: '/paie',
                icon: Wallet,
                description: 'Commissions à payer chaque mois, nettes des avances sur salaire.',
                permission: 'commissions.manage',
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
                permission: 'caisse.manage',
            },
            {
                label: 'Stock',
                to: '/stock',
                icon: Package,
                description: 'Inventaire produits, seuils d’alerte et réapprovisionnement.',
                permission: 'caisse.manage',
            },
            {
                label: 'Dépenses',
                to: '/expenses',
                icon: Receipt,
                description: 'Charges, fournisseurs et suivi budgétaire mensuel.',
                permission: 'caisse.manage',
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
                permission: 'reports.view_all',
            },
            {
                label: 'Marketing',
                to: '/marketing',
                icon: Megaphone,
                description: 'Campagnes SMS, fidélité et relance automatique des clients.',
                permission: 'caisse.manage',
            },
            {
                label: 'Comptes & accès',
                to: '/comptes',
                icon: ShieldCheck,
                description: 'Rôles, statut et mots de passe de tous les comptes de connexion.',
                permission: 'users.manage',
            },
            {
                label: 'Paramètres',
                to: '/settings',
                icon: Settings,
                description: 'Configuration du salon, utilisateurs et préférences.',
            },
            {
                label: "Journal d'activité",
                to: '/activity-log',
                icon: History,
                description: 'Historique des actions sensibles effectuées dans l’application.',
                permission: 'activity_log.view',
            },
        ],
    },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export function getNavItemByPath(pathname: string): NavItem | undefined {
    return navItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
