import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    ArrowRight,
    BarChart3,
    Calendar,
    Check,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    Phone,
    ShoppingCart,
    TrendingUp,
    Users,
    Wallet,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getErrorMessage, loginClient } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Palette — the login is deliberately locked to the noir & or brand   */
/* identity, independent of the app's light/dark theme.                */
/* ------------------------------------------------------------------ */
const GOLD = '#D8B45A';
const GOLD_DEEP = '#B08D3C';

/** A phone-looking identifier: digits/spaces/+()-. and no @ — routed to the client portal login. */
function isPhoneIdentifier(value: string): boolean {
    const trimmed = value.trim();
    return !trimmed.includes('@') && /^\+?[0-9 ().-]{8,}$/.test(trimmed);
}

const loginSchema = z.object({
    identifier: z
        .string()
        .min(1, 'L’email ou le téléphone est requis.')
        .refine(
            (value) => isPhoneIdentifier(value) || z.string().email().safeParse(value.trim()).success,
            'Saisissez un email valide (équipe) ou votre numéro de téléphone (client).',
        ),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
});

type LoginValues = z.infer<typeof loginSchema>;

const FEATURES = [
    {
        icon: Calendar,
        title: 'Agenda temps réel',
        text: 'et rappels automatiques',
    },
    {
        icon: Wallet,
        title: 'Caisse, stock',
        text: 'et dépenses réunis',
    },
    {
        icon: BarChart3,
        title: 'Rapports de rentabilité',
        text: 'par employé',
    },
];

/* Golden dust — deterministic positions so the render is stable. */
const PARTICLES = [
    { left: '8%', top: '72%', size: 3, duration: 16, delay: 0, travel: 260, sway: 24, opacity: 0.45 },
    { left: '16%', top: '88%', size: 2, duration: 13, delay: 2.2, travel: 300, sway: -18, opacity: 0.4 },
    { left: '27%', top: '78%', size: 4, duration: 18, delay: 1.1, travel: 240, sway: 30, opacity: 0.5 },
    { left: '38%', top: '92%', size: 2, duration: 14, delay: 4.4, travel: 320, sway: -26, opacity: 0.35 },
    { left: '52%', top: '84%', size: 3, duration: 17, delay: 0.6, travel: 280, sway: 20, opacity: 0.45 },
    { left: '63%', top: '90%', size: 2, duration: 12, delay: 3.1, travel: 300, sway: 14, opacity: 0.4 },
    { left: '72%', top: '76%', size: 4, duration: 19, delay: 1.8, travel: 250, sway: -30, opacity: 0.5 },
    { left: '84%', top: '86%', size: 2, duration: 15, delay: 5.2, travel: 310, sway: 22, opacity: 0.35 },
    { left: '91%', top: '70%', size: 3, duration: 16, delay: 2.7, travel: 230, sway: -16, opacity: 0.4 },
    { left: '46%', top: '68%', size: 2, duration: 20, delay: 6.4, travel: 220, sway: 26, opacity: 0.3 },
];

/* ------------------------------------------------------------------ */
/* Small motion primitives                                             */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as const;

function easeOutCubic(progress: number): number {
    return 1 - Math.pow(1 - progress, 3);
}

/** rAF count-up, respectful of prefers-reduced-motion. */
function useCountUp(target: number, { duration = 1400, delay = 0, enabled = true } = {}): number {
    const [value, setValue] = useState(enabled ? 0 : target);

    useEffect(() => {
        if (!enabled) {
            setValue(target);
            return;
        }
        let frame = 0;
        let origin: number | null = null;
        const tick = (time: number) => {
            if (origin === null) origin = time;
            const progress = Math.min(1, Math.max(0, (time - origin - delay) / duration));
            setValue(Math.round(target * easeOutCubic(progress)));
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, duration, delay, enabled]);

    return value;
}

/* ------------------------------------------------------------------ */
/* Crest — crown + serif B monogram, pure SVG                          */
/* ------------------------------------------------------------------ */

function Crest({ size = 88, className }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 96 96"
            fill="none"
            aria-hidden
            className={className}
        >
            <defs>
                <linearGradient id="crest-gold" x1="0" y1="0" x2="96" y2="96">
                    <stop offset="0" stopColor="#EED9A0" />
                    <stop offset="0.5" stopColor={GOLD} />
                    <stop offset="1" stopColor={GOLD_DEEP} />
                </linearGradient>
                <radialGradient id="crest-bg" cx="0.5" cy="0.35" r="0.8">
                    <stop offset="0" stopColor="#132030" />
                    <stop offset="1" stopColor="#070E16" />
                </radialGradient>
            </defs>
            {/* Crown */}
            <path
                d="M34 21 L38.5 12.5 L48 19 L57.5 12.5 L62 21 L60 24 L36 24 Z"
                fill="url(#crest-gold)"
            />
            <circle cx="38.5" cy="10" r="1.8" fill={GOLD} />
            <circle cx="57.5" cy="10" r="1.8" fill={GOLD} />
            <circle cx="48" cy="16.2" r="1.6" fill={GOLD} />
            {/* Medallion */}
            <circle cx="48" cy="57" r="30" fill="url(#crest-bg)" stroke="url(#crest-gold)" strokeWidth="1.6" />
            <circle cx="48" cy="57" r="25.5" fill="none" stroke={GOLD} strokeOpacity="0.25" strokeWidth="0.8" />
            {/* Mirrored double-B monogram */}
            <text
                x="42.5"
                y="68"
                fontFamily="'Cormorant Garamond', Georgia, serif"
                fontSize="34"
                fontWeight="600"
                fill={GOLD}
                fillOpacity="0.55"
                textAnchor="middle"
                transform="scale(-1,1) translate(-96 0)"
            >
                B
            </text>
            <text
                x="51"
                y="68"
                fontFamily="'Cormorant Garamond', Georgia, serif"
                fontSize="38"
                fontWeight="700"
                fill="#F4E8CB"
                textAnchor="middle"
            >
                B
            </text>
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Barbershop silhouette — abstract chair + mirror, rim-lit in gold    */
/* ------------------------------------------------------------------ */

function SalonScene({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 520 420" fill="none" aria-hidden className={className}>
            <defs>
                <linearGradient id="scene-rim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={GOLD} stopOpacity="0.55" />
                    <stop offset="1" stopColor={GOLD} stopOpacity="0.05" />
                </linearGradient>
                <radialGradient id="scene-mirror" cx="0.5" cy="0.4" r="0.75">
                    <stop offset="0" stopColor="#16283C" />
                    <stop offset="1" stopColor="#0A1420" />
                </radialGradient>
            </defs>
            {/* Mirror */}
            <rect x="316" y="24" width="168" height="248" rx="84" fill="url(#scene-mirror)" stroke="url(#scene-rim)" strokeWidth="1.4" />
            <rect x="330" y="38" width="140" height="220" rx="70" fill="none" stroke={GOLD} strokeOpacity="0.12" strokeWidth="1" />
            {/* Wall sconce glows */}
            <circle cx="290" cy="60" r="4" fill={GOLD} fillOpacity="0.7" />
            <circle cx="290" cy="60" r="12" fill={GOLD} fillOpacity="0.12" />
            <circle cx="508" cy="60" r="4" fill={GOLD} fillOpacity="0.7" />
            <circle cx="508" cy="60" r="12" fill={GOLD} fillOpacity="0.12" />
            {/* Barber chair — silhouette */}
            <g>
                {/* backrest */}
                <path
                    d="M96 96 Q92 60 128 56 L196 56 Q232 60 228 96 L222 196 L102 196 Z"
                    fill="#0B1622"
                    stroke="url(#scene-rim)"
                    strokeWidth="1.4"
                />
                {/* headrest */}
                <rect x="134" y="34" width="56" height="26" rx="10" fill="#0B1622" stroke="url(#scene-rim)" strokeWidth="1.2" />
                {/* seat */}
                <path
                    d="M84 196 L240 196 Q258 198 256 216 L252 240 Q250 252 236 252 L88 252 Q74 252 72 240 L68 216 Q66 198 84 196 Z"
                    fill="#0C1826"
                    stroke="url(#scene-rim)"
                    strokeWidth="1.4"
                />
                {/* armrests */}
                <path d="M58 176 Q46 176 46 190 L46 218 Q46 228 58 228 L74 228 L74 176 Z" fill="#0B1622" stroke={GOLD} strokeOpacity="0.28" strokeWidth="1.2" />
                <path d="M266 176 Q278 176 278 190 L278 218 Q278 228 266 228 L250 228 L250 176 Z" fill="#0B1622" stroke={GOLD} strokeOpacity="0.28" strokeWidth="1.2" />
                {/* column + base */}
                <rect x="152" y="252" width="20" height="52" rx="6" fill="#0B1622" stroke={GOLD} strokeOpacity="0.22" strokeWidth="1" />
                <path d="M108 330 Q108 306 132 304 L192 304 Q216 306 216 330 L216 336 L108 336 Z" fill="#0B1622" stroke="url(#scene-rim)" strokeWidth="1.2" />
                {/* footrest */}
                <rect x="128" y="278" width="68" height="10" rx="5" fill="#0D1A29" stroke={GOLD} strokeOpacity="0.3" strokeWidth="1" />
            </g>
            {/* Floor line + reflection hint */}
            <line x1="24" y1="336" x2="496" y2="336" stroke={GOLD} strokeOpacity="0.14" />
            <ellipse cx="162" cy="352" rx="120" ry="10" fill={GOLD} fillOpacity="0.05" />
            <ellipse cx="400" cy="352" rx="90" ry="8" fill={GOLD} fillOpacity="0.04" />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Dashboard mockup — KPI count-up + self-drawing sparkline            */
/* ------------------------------------------------------------------ */

const SPARK_PATH = 'M6 64 L40 46 L74 55 L108 30 L142 40 L176 18 L210 26 L244 10';
const SPARK_AREA = `${SPARK_PATH} L244 76 L6 76 Z`;
const DAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const TOP_SERVICES = [
    { name: 'Coupe homme', share: 0.92 },
    { name: 'Barbe', share: 0.71 },
    { name: 'Coupe + barbe', share: 0.55 },
];

function DashboardMockup({ animate }: { animate: boolean }) {
    const revenue = useCountUp(15870, { delay: 700, enabled: animate });
    const bookings = useCountUp(24, { delay: 900, duration: 1100, enabled: animate });

    return (
        <div
            className="w-full rounded-2xl border border-white/10 bg-[#0A121C]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_48px_rgba(216,180,90,0.08)] backdrop-blur-sm"
            aria-hidden
        >
            {/* Header */}
            <div className="flex items-center gap-2">
                <Crest size={26} />
                <div>
                    <p className="text-[10px] font-semibold tracking-[0.08em] text-[#F2EDE3]">
                        BOGOS<span style={{ color: GOLD }}>LAND</span>
                    </p>
                    <p className="text-[7px] font-medium uppercase tracking-[0.22em] text-white/40">Manager</p>
                </div>
                <span className="ml-auto flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[8px] font-medium text-white/50">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    En direct
                </span>
            </div>

            {/* KPIs */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                        Chiffre d'affaires
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-[#F2EDE3]">
                        {revenue.toLocaleString('fr-FR')} <span className="text-[10px] font-semibold" style={{ color: GOLD }}>DH</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
                        <TrendingUp className="h-2.5 w-2.5" />
                        +12,5%
                    </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                        Rendez-vous aujourd'hui
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-[#F2EDE3]">{bookings}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
                        <TrendingUp className="h-2.5 w-2.5" />
                        +6
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                    Performance équipe
                </p>
                <svg viewBox="0 0 250 82" className="mt-1.5 w-full">
                    <defs>
                        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor={GOLD} stopOpacity="0.28" />
                            <stop offset="1" stopColor={GOLD} stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor={GOLD_DEEP} />
                            <stop offset="1" stopColor="#EED9A0" />
                        </linearGradient>
                    </defs>
                    {[18, 40, 62].map((y) => (
                        <line key={y} x1="6" y1={y} x2="244" y2={y} stroke="white" strokeOpacity="0.05" />
                    ))}
                    <motion.path
                        d={SPARK_AREA}
                        fill="url(#spark-fill)"
                        initial={animate ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.7, duration: 0.8 }}
                    />
                    <motion.path
                        d={SPARK_PATH}
                        fill="none"
                        stroke="url(#spark-line)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={animate ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.9, duration: 1.4, ease: 'easeInOut' }}
                    />
                    <motion.circle
                        cx="244"
                        cy="10"
                        r="3"
                        fill={GOLD}
                        initial={animate ? { scale: 0, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 2.2, duration: 0.3 }}
                    />
                </svg>
                <div className="flex justify-between px-1 text-[7px] font-medium tracking-[0.1em] text-white/30">
                    {DAYS.map((day) => (
                        <span key={day}>{day}</span>
                    ))}
                </div>
            </div>

            {/* Top services */}
            <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/40">
                    Services populaires
                </p>
                <div className="mt-2 space-y-2">
                    {TOP_SERVICES.map((service, index) => (
                        <div key={service.name} className="flex items-center gap-2.5">
                            <span className="w-20 truncate text-[9px] text-white/55">{service.name}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                                <motion.div
                                    className="h-full origin-left rounded-full"
                                    style={{
                                        background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD})`,
                                        width: `${service.share * 100}%`,
                                    }}
                                    initial={animate ? { scaleX: 0 } : false}
                                    animate={{ scaleX: 1 }}
                                    transition={{ delay: 1.4 + index * 0.15, duration: 0.7, ease: EASE }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Login() {
    const { user, isLoading, login } = useAuth();
    const { setClient: setPortalClient } = usePortalAuth();
    const navigate = useNavigate();
    const prefersReducedMotion = useReducedMotion() ?? false;
    const [formError, setFormError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [showHelp, setShowHelp] = useState(false);

    /* Subtle mouse parallax on the left scene (desktop pointers only). */
    const sceneRef = useRef<HTMLDivElement | null>(null);
    const backLayerRef = useRef<HTMLDivElement | null>(null);
    const frontLayerRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number>(0);
    const pointerRef = useRef({ x: 0, y: 0 });

    const handleParallax = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (prefersReducedMotion) return;
            const bounds = sceneRef.current?.getBoundingClientRect();
            if (!bounds) return;
            pointerRef.current = {
                x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
                y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
            };
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0;
                const { x, y } = pointerRef.current;
                if (backLayerRef.current) {
                    backLayerRef.current.style.transform = `translate3d(${x * -6}px, ${y * -4}px, 0)`;
                }
                if (frontLayerRef.current) {
                    frontLayerRef.current.style.transform = `translate3d(${x * 10}px, ${y * 7}px, 0)`;
                }
            });
        },
        [prefersReducedMotion],
    );

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { identifier: '', password: '' },
    });

    const identifierValue = watch('identifier') ?? '';
    const looksLikePhone = isPhoneIdentifier(identifierValue);

    if (!isLoading && user) return <Navigate to="/" replace />;

    const onSubmit = async (values: LoginValues) => {
        setFormError(null);
        try {
            if (isPhoneIdentifier(values.identifier)) {
                // Client account — phone + password on the portal guard.
                const portalClient = await loginClient(values.identifier.trim(), values.password);
                setPortalClient(portalClient);
                navigate('/mon-compte', { replace: true });
            } else {
                await login(values.identifier.trim(), values.password, remember);
                navigate('/', { replace: true });
            }
        } catch (error) {
            setFormError(
                getErrorMessage(
                    error,
                    isPhoneIdentifier(values.identifier)
                        ? 'Numéro de téléphone ou mot de passe incorrect.'
                        : 'Identifiants incorrects.',
                ),
            );
        }
    };

    const animate = !prefersReducedMotion;

    return (
        <div className="relative flex min-h-screen overflow-hidden bg-[#050A0F] text-[#F2EDE3]">
            {/* ========================================================= */}
            {/* LEFT — immersive brand panel                              */}
            {/* ========================================================= */}
            <div
                ref={sceneRef}
                onMouseMove={handleParallax}
                className="relative hidden w-[55%] flex-col overflow-hidden p-12 lg:flex xl:p-14"
            >
                {/* Atmosphere */}
                <div
                    ref={backLayerRef}
                    className="pointer-events-none absolute -inset-8 will-change-transform"
                    aria-hidden
                >
                    <div
                        className="absolute inset-0"
                        style={{
                            background: [
                                'radial-gradient(52rem 36rem at 18% -8%, rgba(216,180,90,0.11), transparent 60%)',
                                'radial-gradient(40rem 32rem at 88% 12%, rgba(216,180,90,0.06), transparent 60%)',
                                'radial-gradient(56rem 44rem at 42% 118%, rgba(216,180,90,0.09), transparent 62%)',
                                'linear-gradient(160deg, #07111A 0%, #050A0F 55%, #060D14 100%)',
                            ].join(', '),
                        }}
                    />
                    {/* Barbershop silhouette */}
                    <SalonScene className="absolute bottom-[16%] right-[4%] w-[52%] opacity-70" />
                    {/* Vignette */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                'radial-gradient(120% 90% at 35% 45%, transparent 40%, rgba(3,6,10,0.55) 100%)',
                        }}
                    />
                </div>

                {/* Light streaks + particles */}
                <div className="login-streak inset-y-0 left-[10%] w-[45%]" aria-hidden />
                <div
                    className="login-streak inset-y-0 left-[45%] w-[40%]"
                    style={{ animationDelay: '7s' }}
                    aria-hidden
                />
                {PARTICLES.map((particle, index) => (
                    <span
                        key={index}
                        className="login-particle"
                        style={
                            {
                                left: particle.left,
                                top: particle.top,
                                width: particle.size,
                                height: particle.size,
                                '--drift-duration': `${particle.duration}s`,
                                '--drift-delay': `${particle.delay}s`,
                                '--drift-travel': `${particle.travel}px`,
                                '--drift-sway': `${particle.sway}px`,
                                '--drift-opacity': particle.opacity,
                            } as React.CSSProperties
                        }
                        aria-hidden
                    />
                ))}

                {/* Brand */}
                <motion.div
                    initial={animate ? { opacity: 0, y: 10 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="relative z-10 flex items-center gap-3"
                >
                    <Crest size={44} />
                    <div>
                        <div className="text-lg font-semibold leading-none tracking-tight">
                            BOGOS<span style={{ color: GOLD }}>LAND</span>
                        </div>
                        <div className="mt-1.5 text-[10px] font-medium uppercase leading-none tracking-[0.3em] text-white/40">
                            Manager
                        </div>
                    </div>
                </motion.div>

                {/* Headline + features */}
                <div className="relative z-10 mt-14 xl:mt-16">
                    <h1 className="font-display text-[50px] font-semibold leading-[1.06] tracking-[-0.01em] xl:text-[60px]">
                        <span className="block overflow-hidden">
                            <motion.span
                                className="block"
                                initial={animate ? { y: '108%' } : false}
                                animate={{ y: 0 }}
                                transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
                            >
                                Le salon,
                            </motion.span>
                        </span>
                        <span className="block overflow-hidden pb-4">
                            <motion.span
                                className="block bg-clip-text text-transparent"
                                style={{
                                    backgroundImage: `linear-gradient(100deg, ${GOLD_DEEP} 0%, ${GOLD} 40%, #EED9A0 70%, ${GOLD} 100%)`,
                                }}
                                initial={animate ? { y: '108%' } : false}
                                animate={{ y: 0 }}
                                transition={{ duration: 0.7, delay: 0.28, ease: EASE }}
                            >
                                piloté au détail près.
                            </motion.span>
                        </span>
                    </h1>

                    <motion.p
                        initial={animate ? { opacity: 0, y: 14 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.45, ease: EASE }}
                        className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-white/55"
                    >
                        Rendez-vous, encaissements, stock et performance de l'équipe — réunis dans une
                        interface pensée pour aller vite.
                    </motion.p>

                    <ul className="mt-8 space-y-5">
                        {FEATURES.map((feature, index) => {
                            const Icon = feature.icon;
                            return (
                                <motion.li
                                    key={feature.title}
                                    initial={animate ? { opacity: 0, x: -16 } : false}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.5, delay: 0.55 + index * 0.12, ease: EASE }}
                                    className="flex items-center gap-4"
                                >
                                    <span
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D8B45A]/25 bg-[#D8B45A]/[0.08]"
                                        style={{ boxShadow: '0 0 24px rgba(216,180,90,0.08) inset' }}
                                    >
                                        <Icon className="h-[18px] w-[18px]" style={{ color: GOLD }} />
                                    </span>
                                    <span className="max-w-[220px] text-sm leading-snug">
                                        <span className="block font-semibold text-[#F2EDE3]">{feature.title}</span>
                                        <span className="block text-white/50">{feature.text}</span>
                                    </span>
                                </motion.li>
                            );
                        })}
                    </ul>
                </div>

                {/* Floating dashboard mockup — anchored to the lower-right corner,
                    clear of the text column */}
                <motion.div
                    ref={frontLayerRef}
                    className="pointer-events-none absolute -bottom-5 right-6 z-10 hidden w-[330px] will-change-transform xl:block 2xl:bottom-[6%] 2xl:right-10 2xl:w-[390px]"
                    initial={animate ? { opacity: 0, y: 40, scale: 0.96 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.9, delay: 0.6, ease: EASE }}
                >
                    {/* Golden halo */}
                    <div
                        className="login-halo absolute -inset-10 rounded-full"
                        style={{
                            background:
                                'radial-gradient(closest-side, rgba(216,180,90,0.14), transparent 70%)',
                        }}
                        aria-hidden
                    />
                    <div className="login-float relative">
                        <DashboardMockup animate={animate} />
                    </div>
                </motion.div>

                <motion.p
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1 }}
                    className="relative z-10 mt-auto text-xs text-white/30"
                >
                    © {new Date().getFullYear()} BOGOSLAND. Tous droits réservés.
                </motion.p>
            </div>

            {/* ========================================================= */}
            {/* RIGHT — form                                              */}
            {/* ========================================================= */}
            <div className="relative flex w-full items-center justify-center px-5 py-12 lg:w-[45%] lg:border-l lg:border-white/[0.06] lg:px-12">
                {/* Ambient wash behind the form */}
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background: [
                            'radial-gradient(42rem 30rem at 50% -10%, rgba(216,180,90,0.07), transparent 60%)',
                            'radial-gradient(36rem 26rem at 50% 115%, rgba(216,180,90,0.05), transparent 60%)',
                            'linear-gradient(180deg, #07111A 0%, #050A0F 100%)',
                        ].join(', '),
                    }}
                    aria-hidden
                />
                {/* Bottom golden thread */}
                <svg
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full opacity-50"
                    viewBox="0 0 600 110"
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    <path
                        d="M0 80 Q100 40 200 74 T400 66 T600 84"
                        fill="none"
                        stroke={GOLD}
                        strokeOpacity="0.16"
                        strokeWidth="1"
                    />
                    <path
                        d="M0 96 Q120 66 240 92 T480 86 T600 98"
                        fill="none"
                        stroke={GOLD}
                        strokeOpacity="0.08"
                        strokeWidth="1"
                    />
                </svg>

                <motion.div
                    initial={animate ? { opacity: 0, y: 22 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
                    className="relative w-full max-w-[400px]"
                >
                    {/* Crest */}
                    <div className="flex flex-col items-center">
                        <motion.div
                            className="relative"
                            initial={animate ? { opacity: 0, scale: 0.8 } : false}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
                        >
                            <div
                                className="login-halo absolute -inset-7 rounded-full"
                                style={{
                                    background:
                                        'radial-gradient(closest-side, rgba(216,180,90,0.2), transparent 70%)',
                                }}
                                aria-hidden
                            />
                            <Crest size={92} className="relative" />
                        </motion.div>

                        <h2 className="mt-5 text-center text-[30px] font-semibold tracking-tight">
                            Bon <span style={{ color: GOLD }}>retour</span>{' '}
                            <span aria-hidden>👋</span>
                        </h2>
                        <p className="mt-2 text-center text-sm leading-relaxed text-white/50">
                            Connectez-vous pour accéder à votre tableau de bord.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="mt-9 space-y-5" noValidate>
                        {/* Identifier — staff email OR client phone */}
                        <div className="space-y-2">
                            <label
                                htmlFor="identifier"
                                className="text-[13px] font-medium text-white/70"
                            >
                                Email ou téléphone
                            </label>
                            <div className="group relative">
                                {looksLikePhone ? (
                                    <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#D8B45A] transition-all duration-300" />
                                ) : (
                                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35 transition-all duration-300 group-focus-within:scale-110 group-focus-within:text-[#D8B45A]" />
                                )}
                                <input
                                    id="identifier"
                                    type="text"
                                    autoComplete="username"
                                    placeholder="vous@bogosland.com · 06 12 34 56 78"
                                    aria-invalid={Boolean(errors.identifier)}
                                    className={cn(
                                        loginInputClass,
                                        errors.identifier &&
                                            'border-red-400/50 focus:border-red-400/70 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.08)]',
                                    )}
                                    {...register('identifier')}
                                />
                            </div>
                            {looksLikePhone && !errors.identifier && (
                                <p className="text-xs" style={{ color: GOLD }}>
                                    Connexion client — vous serez dirigé vers votre espace « Mon BOGOSLAND ».
                                </p>
                            )}
                            {errors.identifier && (
                                <p className="text-xs text-red-400">{errors.identifier.message}</p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <label
                                htmlFor="password"
                                className="text-[13px] font-medium text-white/70"
                            >
                                Mot de passe
                            </label>
                            <div className="group relative">
                                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35 transition-all duration-300 group-focus-within:scale-110 group-focus-within:text-[#D8B45A]" />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    aria-invalid={Boolean(errors.password)}
                                    className={cn(
                                        loginInputClass,
                                        'pr-12',
                                        errors.password &&
                                            'border-red-400/50 focus:border-red-400/70 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.08)]',
                                    )}
                                    {...register('password')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((current) => !current)}
                                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/35 transition-colors hover:text-[#D8B45A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B45A]/50"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.password && (
                                <p className="text-xs text-red-400">{errors.password.message}</p>
                            )}
                        </div>

                        {/* Remember / forgot */}
                        <div className="flex items-center justify-between">
                            <label className="flex cursor-pointer select-none items-center gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(event) => setRemember(event.target.checked)}
                                    className="peer sr-only"
                                />
                                <span
                                    className={cn(
                                        'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-all duration-200',
                                        remember
                                            ? 'border-[#D8B45A] bg-[#D8B45A] shadow-[0_0_10px_rgba(216,180,90,0.35)]'
                                            : 'border-white/20 bg-white/[0.04]',
                                    )}
                                    aria-hidden
                                >
                                    <Check
                                        className={cn(
                                            'h-3 w-3 text-[#0A121C] transition-all duration-150',
                                            remember ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                                        )}
                                        strokeWidth={3.5}
                                    />
                                </span>
                                <span className="text-[13px] text-white/55">Se souvenir de moi</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowHelp((current) => !current)}
                                className="text-[13px] font-medium transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B45A]/50"
                                style={{ color: GOLD }}
                            >
                                Mot de passe oublié ?
                            </button>
                        </div>

                        {showHelp && (
                            <motion.p
                                initial={animate ? { opacity: 0, y: -4 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="rounded-xl border border-[#D8B45A]/20 bg-[#D8B45A]/[0.06] px-4 py-3 text-xs leading-relaxed text-white/60"
                            >
                                Votre mot de passe est géré par le salon : contactez votre administrateur
                                pour le réinitialiser en quelques secondes.
                            </motion.p>
                        )}

                        {/* Error */}
                        {formError && (
                            <motion.div
                                initial={animate ? { opacity: 0, y: -6 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                role="alert"
                                className="flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-4 py-3"
                            >
                                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-400" />
                                <p className="text-sm text-red-300">{formError}</p>
                            </motion.div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={cn(
                                'login-shine group flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-[#0A121C]',
                                'transition-all duration-300',
                                'hover:shadow-[0_8px_32px_rgba(216,180,90,0.35)] active:scale-[0.985]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B45A]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050A0F]',
                                'disabled:cursor-not-allowed disabled:opacity-80',
                            )}
                            style={{
                                background: `linear-gradient(115deg, ${GOLD_DEEP} 0%, ${GOLD} 35%, #EBCB7E 55%, ${GOLD} 100%)`,
                                boxShadow: '0 4px 20px rgba(216,180,90,0.25)',
                            }}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                                    Connexion en cours…
                                </>
                            ) : (
                                <>
                                    Se connecter
                                    <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-7 text-center text-[13px] text-white/45">
                        Besoin d'aide ?{' '}
                        <span className="font-medium" style={{ color: GOLD }}>
                            Contactez votre administrateur.
                        </span>
                    </p>

                    {/* Decorative feature strip */}
                    <div className="mt-9 flex items-center justify-center gap-5" aria-hidden>
                        {[Calendar, ShoppingCart, BarChart3, Users].map((Icon, index) => (
                            <motion.span
                                key={index}
                                initial={animate ? { opacity: 0, y: 10 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 1 + index * 0.1, ease: EASE }}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] transition-colors duration-300 hover:border-[#D8B45A]/30"
                            >
                                <Icon className="h-4 w-4 text-white/30" />
                            </motion.span>
                        ))}
                    </div>

                    {/* Mobile-only copyright */}
                    <p className="mt-8 text-center text-[11px] text-white/25 lg:hidden">
                        © {new Date().getFullYear()} BOGOSLAND. Tous droits réservés.
                    </p>
                </motion.div>
            </div>
        </div>
    );
}

const loginInputClass = cn(
    'h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-11 pr-4 text-[15px] text-[#F2EDE3]',
    'placeholder:text-white/25',
    'transition-all duration-300',
    'hover:border-white/[0.16]',
    'focus:border-[#D8B45A]/60 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(216,180,90,0.1)] focus:outline-none',
);
