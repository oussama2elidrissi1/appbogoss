/** Réservation prise sur le site vitrine bogosland.com (plugin WordPress). */
export type SiteReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface SiteReservation {
    id: number;
    client_name: string;
    client_phone: string;
    client_email: string | null;
    /** Nom du service ou du pack réservé. */
    service: string | null;
    is_pack: boolean;
    /** Date murale du salon (YYYY-MM-DD). */
    date: string;
    /** Heure murale du salon (HH:MM). */
    time: string;
    duration_min: number;
    price: number;
    status: SiteReservationStatus;
    notes: string | null;
    /** Horodatage de la demande côté WordPress (YYYY-MM-DD HH:MM:SS). */
    created_at: string;
}

export interface SiteReservationPage {
    data: SiteReservation[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
    counts: Record<'all' | SiteReservationStatus, number>;
}
