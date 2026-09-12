import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/api';
import {
    bookLandingOffer,
    getLanding,
    getLandingAvailability,
    type LandingBookingResult,
    type LandingOffering,
} from '@/lib/partnerQrApi';

/**
 * LA PAGE PUBLIQUE D'UN QR PARTENAIRE — /p/{token}.
 *
 * Écran de scan : on l'ouvre debout, d'une main, dans le hall d'un hôtel.
 * Tout y est donc mobile-first, en noir / blanc / doré, et le parcours tient
 * en trois écrans — offres, créneau, coordonnées — sans compte ni étape
 * superflue.
 *
 * Cette page est volontairement AUTONOME : elle n'utilise ni le layout de
 * l'application, ni son thème, ni ses composants d'interface, qui sont faits
 * pour un poste de travail connecté. Elle pose ses propres couleurs en dur,
 * pour que l'identité Bogosland soit la même quel que soit le réglage clair
 * ou sombre du téléphone du visiteur.
 *
 * Elle ne connaît aucun identifiant de partenaire : elle n'a que le jeton de
 * l'URL, et c'est le serveur qui en déduit tout le reste.
 */

const INK = '#0B0B0C';
const GOLD = '#C8A24C';
const PAPER = '#F7F5F2';

type Step = 'offers' | 'slot' | 'details' | 'done';

function money(amount: number): string {
    return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} DH`;
}

function isoDay(offset = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export default function PartnerLanding() {
    const { token = '' } = useParams<{ token: string }>();

    const [step, setStep] = useState<Step>('offers');
    const [offering, setOffering] = useState<LandingOffering | null>(null);
    const [day, setDay] = useState(isoDay());
    const [slot, setSlot] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<LandingBookingResult | null>(null);

    const { data, isPending, isError } = useQuery({
        queryKey: ['partner-landing', token],
        queryFn: () => getLanding(token),
        retry: false,
    });

    const availability = useQuery({
        queryKey: ['partner-landing', token, 'availability', offering?.id, day],
        queryFn: () => getLandingAvailability(token, offering!.id, day),
        enabled: offering !== null && step === 'slot',
    });

    // Les sept prochains jours : un salon ne se réserve pas à six mois, et
    // une liste courte évite un sélecteur de date sur mobile.
    const days = useMemo(() => Array.from({ length: 7 }, (_, index) => isoDay(index)), []);

    useEffect(() => {
        setSlot(null);
    }, [day, offering]);

    async function submit() {
        if (!offering || !slot) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await bookLandingOffer(token, {
                offering_id: offering.id,
                starts_at: slot,
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim() || null,
                note: form.note.trim() || null,
            });
            setDone(result);
            setStep('done');
        } catch (err) {
            setError(getErrorMessage(err, 'La réservation n’a pas pu être enregistrée.'));
        } finally {
            setSubmitting(false);
        }
    }

    // ------------------------------------------------------------- états

    if (isPending) {
        return (
            <Shell>
                <p style={{ color: GOLD, textAlign: 'center', padding: '80px 0' }}>Chargement…</p>
            </Shell>
        );
    }

    // Jeton inconnu, révoqué, partenaire suspendu, page fermée : un seul
    // message, sobre. Jamais d'erreur technique sous les yeux d'un client.
    if (isError || !data) {
        return (
            <Shell>
                <div style={{ textAlign: 'center', padding: '72px 8px' }}>
                    <h1 style={{ ...titleStyle, fontSize: 30 }}>BOGOS LAND</h1>
                    <p style={{ color: '#B9B4AC', marginTop: 24, lineHeight: 1.6 }}>
                        Cette offre n’est actuellement pas disponible.
                    </p>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <header style={{ textAlign: 'center', paddingTop: 36 }}>
                <h1 style={titleStyle}>{data.landing.title}</h1>
                <p style={{ color: GOLD, letterSpacing: 3, fontSize: 11, marginTop: 8, textTransform: 'uppercase' }}>
                    {data.landing.subtitle}
                </p>
                <div style={{ width: 56, height: 1, background: GOLD, margin: '18px auto' }} />
                <p style={{ color: '#CFC9C0', fontSize: 15 }}>{data.landing.intro}</p>
            </header>

            {step === 'offers' && (
                <section style={{ marginTop: 28, display: 'grid', gap: 14 }}>
                    {data.offerings.length === 0 ? (
                        <p style={{ color: '#B9B4AC', textAlign: 'center', padding: '32px 0' }}>
                            Aucune offre disponible pour le moment.
                        </p>
                    ) : (
                        data.offerings.map((item) => (
                            <article key={item.id} style={cardStyle(item.is_featured)}>
                                {item.is_featured && <span style={badgeStyle}>Recommandé</span>}
                                <h2 style={{ fontSize: 19, fontWeight: 700, color: '#FFFFFF' }}>{item.title}</h2>
                                {item.description && (
                                    <p style={{ color: '#B9B4AC', fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
                                        {item.description}
                                    </p>
                                )}
                                {item.includes.length > 0 && (
                                    <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
                                        {item.includes.map((included) => (
                                            <li
                                                key={included.name}
                                                style={{ color: '#CFC9C0', fontSize: 13, padding: '2px 0' }}
                                            >
                                                <span style={{ color: GOLD, marginRight: 8 }}>◆</span>
                                                {included.name}
                                                {included.quantity > 1 ? ` ×${included.quantity}` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 14 }}>
                                    <span style={{ fontSize: 26, fontWeight: 700, color: GOLD }}>
                                        {money(item.price)}
                                    </span>
                                    {item.compare_at_price !== null && (
                                        <span
                                            style={{
                                                color: '#8C867D',
                                                textDecoration: 'line-through',
                                                fontSize: 15,
                                                paddingBottom: 3,
                                            }}
                                        >
                                            {money(item.compare_at_price)}
                                        </span>
                                    )}
                                    <span style={{ marginLeft: 'auto', color: '#8C867D', fontSize: 13 }}>
                                        {item.duration_minutes} min
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    style={primaryButton}
                                    onClick={() => {
                                        setOffering(item);
                                        setStep('slot');
                                    }}
                                >
                                    Réserver
                                </button>
                            </article>
                        ))
                    )}
                </section>
            )}

            {step === 'slot' && offering && (
                <section style={{ marginTop: 24 }}>
                    <BackLink onClick={() => setStep('offers')} label="Changer d’offre" />
                    <h2 style={sectionTitle}>{offering.title}</h2>

                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0 12px' }}>
                        {days.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setDay(value)}
                                style={chipStyle(value === day)}
                            >
                                {dayLabel(value)}
                            </button>
                        ))}
                    </div>

                    {availability.isPending ? (
                        <p style={{ color: '#8C867D', padding: '24px 0' }}>Recherche des créneaux…</p>
                    ) : !availability.data?.open ? (
                        <p style={{ color: '#B9B4AC', padding: '24px 0' }}>Le salon est fermé ce jour-là.</p>
                    ) : (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                                gap: 8,
                            }}
                        >
                            {availability.data.slots
                                .filter((item) => item.available)
                                .map((item) => (
                                    <button
                                        key={item.starts_at}
                                        type="button"
                                        onClick={() => setSlot(item.starts_at)}
                                        style={chipStyle(item.starts_at === slot)}
                                    >
                                        {item.time}
                                    </button>
                                ))}
                            {availability.data.slots.every((item) => !item.available) && (
                                <p style={{ color: '#B9B4AC', gridColumn: '1 / -1', padding: '16px 0' }}>
                                    Plus de créneau libre ce jour-là.
                                </p>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={slot === null}
                        style={{ ...primaryButton, opacity: slot === null ? 0.4 : 1 }}
                        onClick={() => setStep('details')}
                    >
                        Continuer
                    </button>
                </section>
            )}

            {step === 'details' && offering && slot && (
                <section style={{ marginTop: 24 }}>
                    <BackLink onClick={() => setStep('slot')} label="Changer de créneau" />
                    <h2 style={sectionTitle}>Vos coordonnées</h2>
                    <p style={{ color: '#8C867D', fontSize: 13.5, marginBottom: 16 }}>
                        {offering.title} · {slot.replace(' ', ' à ')} · {money(offering.price)}
                    </p>

                    <Field label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                    <Field
                        label="Téléphone"
                        value={form.phone}
                        onChange={(v) => setForm({ ...form, phone: v })}
                        placeholder="06 12 34 56 78"
                        inputMode="tel"
                    />
                    <Field
                        label="E-mail (facultatif)"
                        value={form.email}
                        onChange={(v) => setForm({ ...form, email: v })}
                        inputMode="email"
                    />
                    <Field label="Note (facultatif)" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />

                    {error && (
                        <p style={{ color: '#E39A9A', fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>{error}</p>
                    )}

                    <button
                        type="button"
                        disabled={submitting || form.name.trim() === '' || form.phone.trim() === ''}
                        style={{
                            ...primaryButton,
                            opacity: submitting || form.name.trim() === '' || form.phone.trim() === '' ? 0.4 : 1,
                        }}
                        onClick={() => void submit()}
                    >
                        {submitting ? 'Envoi…' : 'Confirmer ma réservation'}
                    </button>
                </section>
            )}

            {step === 'done' && done && (
                <section style={{ marginTop: 40, textAlign: 'center' }}>
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 999,
                            border: `1px solid ${GOLD}`,
                            color: GOLD,
                            fontSize: 30,
                            lineHeight: '62px',
                            margin: '0 auto 20px',
                        }}
                    >
                        ✓
                    </div>
                    <h2 style={{ ...sectionTitle, textAlign: 'center' }}>C’est noté</h2>
                    <p style={{ color: '#CFC9C0', lineHeight: 1.6, marginTop: 10 }}>{done.message}</p>
                    <p style={{ color: '#8C867D', fontSize: 13.5, marginTop: 18 }}>
                        {done.offering_title} · {done.starts_at?.replace(' ', ' à ')} · {money(done.price)}
                    </p>
                    <button
                        type="button"
                        style={{ ...primaryButton, background: 'transparent', color: GOLD, border: `1px solid ${GOLD}` }}
                        onClick={() => {
                            setDone(null);
                            setOffering(null);
                            setSlot(null);
                            setForm({ name: '', phone: '', email: '', note: '' });
                            setStep('offers');
                        }}
                    >
                        Réserver autre chose
                    </button>
                </section>
            )}

            <footer style={{ textAlign: 'center', padding: '40px 0 24px', color: '#5C574F', fontSize: 11 }}>
                BOGOS LAND · Barbershop &amp; Hammam Turc
            </footer>
        </Shell>
    );
}

// ------------------------------------------------------------- présentation

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ minHeight: '100dvh', background: INK, color: PAPER }}>
            <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px' }}>{children}</div>
        </div>
    );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                background: 'none',
                border: 'none',
                color: GOLD,
                fontSize: 13,
                padding: '4px 0',
                cursor: 'pointer',
            }}
        >
            ← {label}
        </button>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    inputMode,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    inputMode?: 'tel' | 'email';
}) {
    return (
        <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', color: '#8C867D', fontSize: 12, marginBottom: 6 }}>{label}</span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                inputMode={inputMode}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#141416',
                    border: '1px solid #2A2A2E',
                    borderRadius: 10,
                    color: PAPER,
                    fontSize: 16,
                    padding: '13px 14px',
                    outline: 'none',
                }}
            />
        </label>
    );
}

const titleStyle: React.CSSProperties = {
    fontFamily: 'Georgia, serif',
    fontSize: 38,
    letterSpacing: 3,
    margin: 0,
    color: '#FFFFFF',
};

const sectionTitle: React.CSSProperties = {
    fontFamily: 'Georgia, serif',
    fontSize: 22,
    margin: '10px 0 4px',
    color: '#FFFFFF',
};

function cardStyle(featured: boolean): React.CSSProperties {
    return {
        position: 'relative',
        background: '#141416',
        border: `1px solid ${featured ? GOLD : '#26262A'}`,
        borderRadius: 14,
        padding: 18,
    };
}

const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: -10,
    right: 16,
    background: GOLD,
    color: INK,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 999,
};

const primaryButton: React.CSSProperties = {
    width: '100%',
    marginTop: 16,
    background: GOLD,
    color: INK,
    border: 'none',
    borderRadius: 10,
    padding: '15px 16px',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.4,
    cursor: 'pointer',
};

function chipStyle(selected: boolean): React.CSSProperties {
    return {
        background: selected ? GOLD : '#141416',
        color: selected ? INK : PAPER,
        border: `1px solid ${selected ? GOLD : '#2A2A2E'}`,
        borderRadius: 999,
        padding: '10px 14px',
        fontSize: 13.5,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
    };
}
