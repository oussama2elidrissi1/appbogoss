import type { BadgeProps } from '@/components/ui/badge';
import type { Appointment } from '@/types/workday';

/**
 * Le canal de création d'une réservation — la colonne `appointments.source`.
 *
 * UNE seule table de vérité pour tous les écrans (liste, détail, file de
 * triage) : libellé court pour le badge, libellé long pour la section
 * « Origine », variante visuelle. Une réservation d'avant la colonne
 * (source null) est traitée comme créée par le staff.
 */
export type ReservationSource = 'web_admin' | 'partner' | 'mobile_public' | 'pos';

export const SOURCE_META: Record<
    ReservationSource,
    { label: string; longLabel: string; variant: BadgeProps['variant'] }
> = {
    mobile_public: {
        label: 'App mobile',
        longLabel: 'Application mobile Bogosland',
        variant: 'accent',
    },
    partner: { label: 'Partenaire', longLabel: 'Portail partenaire', variant: 'outline' },
    web_admin: { label: 'Web', longLabel: 'Agenda BOGOSLAND', variant: 'outline' },
    pos: { label: 'POS', longLabel: 'Caisse', variant: 'outline' },
};

export function sourceMeta(appointment: Pick<Appointment, 'source' | 'partner_id'>) {
    const source = (appointment.source ??
        (appointment.partner_id ? 'partner' : 'web_admin')) as ReservationSource;
    return SOURCE_META[source] ?? SOURCE_META.web_admin;
}

/** Les options du filtre « Source » — seules les valeurs réellement émises. */
export const SOURCE_FILTERS: Array<{ value: ReservationSource | 'all'; label: string }> = [
    { value: 'all', label: 'Toutes sources' },
    { value: 'mobile_public', label: 'App mobile' },
    { value: 'web_admin', label: 'Web' },
    { value: 'partner', label: 'Partenaire' },
];
