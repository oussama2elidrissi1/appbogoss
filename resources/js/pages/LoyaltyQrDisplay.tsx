import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Scissors } from 'lucide-react';
import { getLoyaltyQr } from '@/lib/api';
import type { LoyaltyQrPosterLanguage } from '@/types/loyalty';

/**
 * Full-screen animated version of the registration QR — meant to be left
 * open on a tablet/screen at the salon counter instead of (or alongside)
 * the printed A4 poster. Opened from Fidélité → QR Code via « Afficher à
 * l'écran ». Deliberately self-contained visually (fixed dark premium
 * palette, independent of the app's light/dark theme) since it plays the
 * role of digital signage, not of an app screen.
 */

const GOLD = '#c9973f';
const GOLD_LIGHT = '#e0b56a';

const CAPTIONS: Record<'fr' | 'ar', { eyebrow: string; hint: string }> = {
    fr: { eyebrow: 'Programme de fidélité', hint: 'Scannez avec l’appareil photo de votre téléphone' },
    ar: { eyebrow: 'برنامج الولاء', hint: 'امسحوا الرمز بكاميرا هاتفكم' },
};

function joinUrl(token: string): string {
    return `${window.location.origin}/join?t=${encodeURIComponent(token)}`;
}

/** Slow-drifting gold glow blobs behind everything. */
function AuroraBackground() {
    return (
        <>
            <motion.div
                className="pointer-events-none absolute rounded-full"
                style={{
                    width: '60vmax',
                    height: '60vmax',
                    top: '-25vmax',
                    left: '-15vmax',
                    background: `radial-gradient(circle, ${GOLD}26 0%, transparent 60%)`,
                }}
                animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
                transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="pointer-events-none absolute rounded-full"
                style={{
                    width: '55vmax',
                    height: '55vmax',
                    bottom: '-25vmax',
                    right: '-15vmax',
                    background: `radial-gradient(circle, ${GOLD}1f 0%, transparent 60%)`,
                }}
                animate={{ x: [0, -50, 0], y: [0, -35, 0] }}
                transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
            />
        </>
    );
}

/** A handful of slowly rising gold sparks, each on its own rhythm. */
function Particles() {
    const particles = [
        { left: '12%', size: 5, duration: 11, delay: 0 },
        { left: '22%', size: 3, duration: 14, delay: 3 },
        { left: '38%', size: 4, duration: 12, delay: 6 },
        { left: '58%', size: 3, duration: 15, delay: 1.5 },
        { left: '72%', size: 5, duration: 13, delay: 4.5 },
        { left: '86%', size: 4, duration: 16, delay: 7.5 },
    ];

    return (
        <>
            {particles.map((particle, index) => (
                <motion.span
                    key={index}
                    className="pointer-events-none absolute rounded-full"
                    style={{
                        left: particle.left,
                        bottom: '-2vh',
                        width: particle.size,
                        height: particle.size,
                        background: GOLD_LIGHT,
                        boxShadow: `0 0 ${particle.size * 3}px ${GOLD_LIGHT}`,
                    }}
                    animate={{ y: ['0vh', '-108vh'], opacity: [0, 0.8, 0.8, 0] }}
                    transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        repeat: Infinity,
                        ease: 'linear',
                        times: [0, 0.12, 0.85, 1],
                    }}
                />
            ))}
        </>
    );
}

/** BOGOSLAND wordmark, letters cascading in, "LAND" in gold. */
function AnimatedWordmark() {
    const letters = [...'BOGOSLAND'];

    return (
        <div className="flex" aria-label="BOGOSLAND">
            {letters.map((letter, index) => (
                <motion.span
                    key={index}
                    initial={{ opacity: 0, y: 26, rotateX: 90 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ delay: 0.55 + index * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="text-[clamp(2.2rem,6vw,4.2rem)] font-bold tracking-[0.08em]"
                    style={{ color: index >= 5 ? GOLD : '#f5f1e8' }}
                >
                    {letter}
                </motion.span>
            ))}
        </div>
    );
}

export default function LoyaltyQrDisplay() {
    const [qrImage, setQrImage] = useState<string | null>(null);
    const qrQuery = useQuery({ queryKey: ['loyalty-qr'], queryFn: getLoyaltyQr });

    useEffect(() => {
        if (!qrQuery.data?.token) return;
        let cancelled = false;
        QRCode.toDataURL(joinUrl(qrQuery.data.token), { margin: 1, width: 640 })
            .then((url) => {
                if (!cancelled) setQrImage(url);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [qrQuery.data?.token]);

    const language: LoyaltyQrPosterLanguage = qrQuery.data?.poster_language ?? 'fr';
    const langs: Array<'fr' | 'ar'> = language === 'both' ? ['fr', 'ar'] : [language];
    const message = qrQuery.data?.message ?? 'Scannez pour rejoindre les avantages BOGOSLAND';

    return (
        <div
            className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10 text-center"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, #122336 0%, #0a1522 65%)' }}
        >
            <AuroraBackground />
            <Particles />

            {/* Logo block */}
            <div className="relative flex flex-col items-center">
                <motion.span
                    initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
                    style={{ background: `${GOLD}1f`, boxShadow: `inset 0 0 0 1px ${GOLD}59` }}
                >
                    <motion.span
                        animate={{ rotate: [0, -8, 6, 0] }}
                        transition={{ duration: 5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                    >
                        <Scissors className="h-10 w-10" style={{ color: GOLD }} />
                    </motion.span>
                    {/* Expanding halo ring */}
                    <motion.span
                        className="absolute h-20 w-20 rounded-2xl"
                        style={{ border: `1px solid ${GOLD}` }}
                        animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
                    />
                </motion.span>

                <AnimatedWordmark />

                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 1.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5 h-px w-28"
                    style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
                />

                {langs.map((lang) => (
                    <motion.p
                        key={lang}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        lang={lang}
                        initial={{ opacity: 0, letterSpacing: '0.6em' }}
                        animate={{ opacity: 1, letterSpacing: '0.32em' }}
                        transition={{ delay: 1.55, duration: 1 }}
                        className="mt-4 text-[11px] font-medium uppercase"
                        style={{ color: `${GOLD_LIGHT}cc` }}
                    >
                        {CAPTIONS[lang].eyebrow}
                    </motion.p>
                ))}
            </div>

            {/* Message */}
            <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.9, duration: 0.7 }}
                className="mt-8 max-w-xl text-lg italic leading-relaxed"
                style={{ color: '#e8e2d4' }}
            >
                {message}
            </motion.p>

            {/* QR card — floats gently, gold breathing corners, sweeping scan line */}
            <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 2.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative mt-10"
            >
                <motion.div
                    animate={{ y: [0, -9, 0] }}
                    transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative rounded-3xl bg-white p-7"
                    style={{ boxShadow: `0 24px 70px rgba(0,0,0,0.55), 0 0 60px ${GOLD}30` }}
                >
                    {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                        <motion.span
                            key={corner}
                            className="absolute h-7 w-7"
                            animate={{ opacity: [0.55, 1, 0.55] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                top: corner.startsWith('t') ? 10 : undefined,
                                bottom: corner.startsWith('b') ? 10 : undefined,
                                left: corner.endsWith('l') ? 10 : undefined,
                                right: corner.endsWith('r') ? 10 : undefined,
                                borderTop: corner.startsWith('t') ? `3px solid ${GOLD}` : undefined,
                                borderBottom: corner.startsWith('b') ? `3px solid ${GOLD}` : undefined,
                                borderLeft: corner.endsWith('l') ? `3px solid ${GOLD}` : undefined,
                                borderRight: corner.endsWith('r') ? `3px solid ${GOLD}` : undefined,
                                borderRadius: 4,
                            }}
                        />
                    ))}

                    <div className="relative overflow-hidden rounded-xl">
                        {qrImage ? (
                            <img
                                src={qrImage}
                                alt="QR Code d'inscription BOGOSLAND"
                                className="block h-[min(52vmin,340px)] w-[min(52vmin,340px)]"
                            />
                        ) : (
                            <div className="h-[min(52vmin,340px)] w-[min(52vmin,340px)] animate-pulse rounded-xl bg-neutral-200" />
                        )}

                        {/* Scan line sweep */}
                        {qrImage && (
                            <motion.div
                                className="pointer-events-none absolute inset-x-0 h-16"
                                style={{
                                    background: `linear-gradient(180deg, transparent, ${GOLD}3d 45%, ${GOLD}66 50%, ${GOLD}3d 55%, transparent)`,
                                }}
                                initial={{ top: '-20%' }}
                                animate={{ top: ['-20%', '110%'] }}
                                transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
                            />
                        )}
                    </div>
                </motion.div>
            </motion.div>

            {/* Scan hint(s) */}
            <div className="mt-9 space-y-1.5">
                {langs.map((lang) => (
                    <motion.p
                        key={lang}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        lang={lang}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 1, 0.45, 1] }}
                        transition={{ delay: 2.8, duration: 4, repeat: Infinity, repeatDelay: 1, times: [0, 0.15, 0.6, 0.8, 1] }}
                        className="text-sm"
                        style={{ color: '#9aa7b5' }}
                    >
                        {CAPTIONS[lang].hint}
                    </motion.p>
                ))}
            </div>
        </div>
    );
}
