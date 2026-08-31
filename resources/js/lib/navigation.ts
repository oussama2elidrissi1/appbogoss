import {
    BadgeCheck,
    BarChart3,
    Calendar,
    CalendarCheck,
    CalendarClock,
    Gift,
    HandCoins,
    Handshake,
    History,
    LayoutDashboard,
    Megaphone,
    MessageCircle,
    Package,
    QrCode,
    Receipt,
    ScanLine,
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
    /** When set, the link is hidden for users lacking this permission (any one of the array suffices). */
    permission?: string | string[];
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
                permission: ['agenda.manage', 'agenda.partner'],
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
                label: 'Partenaires',
                to: '/partenaires',
                icon: Handshake,
                description: 'Comptes partenaires, commissions par service et réservations apportées.',
                permission: 'partners.manage',
            },
            {
                label: 'Réservations partenaires',
                to: '/partner-reservations',
                icon: CalendarCheck,
                description: 'Demandes de réservation en attente — accepter, refuser ou proposer un autre créneau.',
                permission: 'partners.manage',
            },
            {
                label: 'Commissions partenaires',
                to: '/partner-commissions',
                icon: HandCoins,
                description: 'Commissions dues aux partenaires et paiements effectués.',
                permission: 'partners.manage',
            },
            {
                label: 'Support partenaires',
                to: '/support-inbox',
                icon: MessageCircle,
                description: 'Conversations de support avec les partenaires.',
                permission: 'partners.manage',
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
                description: 'Ouverture de journée, factures, encaissement, pourboires et clôture.',
                permission: 'caisse_v2.access',
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
        heading: 'Fidélité',
        items: [
            {
                label: 'Programmes de fidélité',
                to: '/loyalty-programs',
                icon: Gift,
                description: 'Comptes fidélité numériques des clients — cumul de services, points ou visites.',
                permission: 'loyalty.manage',
            },
            {
                label: "Plans d'abonnement",
                to: '/subscription-plans',
                icon: CalendarClock,
                description: 'Plans payants avec quotas, jours, horaires et limites configurables.',
                permission: 'loyalty.manage',
            },
            {
                label: 'Abonnés & suivi',
                to: '/abonnements',
                icon: BadgeCheck,
                description: 'Abonnements vendus, historique des visites et rapports.',
                permission: 'subscriptions.view',
            },
            {
                label: 'Scanner abonnement',
                to: '/scanner-abonnements',
                icon: ScanLine,
                description: 'Scannez le QR du client et validez sa visite en caisse.',
                permission: 'subscriptions.use',
            },
            {
                label: 'QR Code',
                to: '/loyalty-qr',
                icon: QrCode,
                description: 'QR d’inscription à afficher/imprimer au salon pour rejoindre le programme.',
                permission: 'loyalty.qr.manage',
            },
            {
                label: 'Paramètres fidélité',
                to: '/loyalty-settings',
                icon: Settings,
                description: 'OTP, expiration des récompenses, alertes d’abonnement et notifications.',
                permission: 'loyalty.settings.manage',
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
                label: 'Clôture du mois',
                to: '/cloture',
                icon: CalendarClock,
                description: 'Finaliser un mois terminé : paiements, journées de caisse, clôture.',
                permission: 'months.close',
            },
            {
                label: 'Historique des clôtures',
                to: '/clotures',
                icon: CalendarCheck,
                description: 'Mois définitivement clôturés, avec leur rapport figé.',
                permission: 'months.history.view',
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
