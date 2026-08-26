import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import jsQR from 'jsqr';
import {
    AlertCircle,
    Camera,
    CameraOff,
    CheckCircle2,
    ChevronRight,
    Clock,
    History,
    KeyRound,
    Loader2,
    Phone,
    QrCode,
    RefreshCw,
    ScanLine,
    ShieldCheck,
    User,
    XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getEmployees, getErrorMessage, getSubscriptionScanCard, validateSubscriptionVisit } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { ScanCardService, SubscriptionScanCard, ValidateVisitResponse } from '@/types/loyalty';
import { useAuth } from '@/hooks/useAuth';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmployeeAvatar } from '@/components/workday/EmployeeAvatar';
import { Input } from '@/components/ui/input';
import { pageFade } from '@/lib/motion';

const STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    active: { label: 'ACTIF', variant: 'success' },
    suspended: { label: 'SUSPENDU', variant: 'default' },
    expired: { label: 'EXPIRÉ', variant: 'destructive' },
    cancelled: { label: 'ANNULÉ', variant: 'destructive' },
};

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Accepts a raw token, or a URL whose last path segment is the token. */
function extractToken(raw: string): string {
    const text = raw.trim();
    if (!text) return '';
    if (text.includes('/')) {
        const segments = text.split('/').filter(Boolean);
        return segments[segments.length - 1] ?? '';
    }
    return text;
}

export default function ScannerAbonnements() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user, hasPermission } = useAuth();
    const [scanning, setScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState('');
    const [card, setCard] = useState<SubscriptionScanCard | null>(null);
    const [cardToken, setCardToken] = useState<string | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [success, setSuccess] = useState<ValidateVisitResponse | null>(null);
    const [selectedPlanServiceId, setSelectedPlanServiceId] = useState<number | null>(null);
    const [employeeId, setEmployeeId] = useState<number | ''>(() => user?.employee_id ?? '');

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number>(0);
    const scanningRef = useRef(false);

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'scanner'],
        queryFn: () => getEmployees(),
        staleTime: 5 * 60_000,
        // The employees endpoint requires employees.manage (held by admin/caissier).
        enabled: hasPermission('employees.manage'),
    });

    const stopCamera = useCallback(() => {
        scanningRef.current = false;
        cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setScanning(false);
    }, []);

    useEffect(() => () => stopCamera(), [stopCamera]);

    const lookupMutation = useMutation({
        mutationFn: getSubscriptionScanCard,
        onSuccess: (data, token) => {
            setCard(data);
            setCardToken(token);
            setLookupError(null);
            setSuccess(null);
            const firstUsable = data.services.find(
                (service) => service.unlimited || (service.total_remaining ?? 1) > 0,
            );
            setSelectedPlanServiceId(firstUsable?.plan_service_id ?? data.services[0]?.plan_service_id ?? null);
        },
        onError: (error) => {
            setCard(null);
            setCardToken(null);
            setLookupError(getErrorMessage(error, t('QR code invalide.')));
        },
    });

    const validateMutation = useMutation({
        mutationFn: ({ token, planServiceId, employee }: { token: string; planServiceId: number; employee: number }) =>
            validateSubscriptionVisit(token, {
                subscription_plan_service_id: planServiceId,
                employee_id: employee,
            }),
        onSuccess: (data) => {
            setSuccess(data);
            setCard(data.card);
            void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        },
    });

    const handleDetected = useCallback(
        (raw: string) => {
            const token = extractToken(raw);
            if (!token) return;
            if (navigator.vibrate) navigator.vibrate(60);
            stopCamera();
            lookupMutation.mutate(token);
        },
        [lookupMutation, stopCamera],
    );

    const startCamera = useCallback(async () => {
        setCameraError(null);
        setLookupError(null);
        setSuccess(null);
        setCard(null);
        setCardToken(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            setScanning(true);
            scanningRef.current = true;

            requestAnimationFrame(() => {
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = stream;
                void video.play();

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });

                const tick = () => {
                    if (!scanningRef.current) return;
                    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: 'dontInvert',
                        });
                        if (code?.data) {
                            handleDetected(code.data);
                            return;
                        }
                    }
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            });
        } catch {
            setCameraError(
                t("Impossible d'accéder à la caméra. Autorisez la caméra dans votre navigateur, ou saisissez le code manuellement ci-dessous."),
            );
        }
    }, [handleDetected, t]);

    function reset() {
        stopCamera();
        setCard(null);
        setCardToken(null);
        setSuccess(null);
        setLookupError(null);
        setManualToken('');
        validateMutation.reset();
        lookupMutation.reset();
    }

    const selectedService = card?.services.find((service) => service.plan_service_id === selectedPlanServiceId) ?? null;
    const status = card ? (STATUS_META[card.subscription.status] ?? STATUS_META.active) : null;
    const validateError = validateMutation.isError ? getErrorMessage(validateMutation.error) : null;
    const canSelectEmployee = hasPermission('employees.manage');
    const ownEmployeeId = user?.employee_id ?? '';
    const effectiveEmployeeId = canSelectEmployee ? employeeId : ownEmployeeId;
    const canValidate =
        Boolean(card?.usable) &&
        selectedPlanServiceId !== null &&
        effectiveEmployeeId !== '' &&
        !validateMutation.isPending;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t('Scanner abonnement')}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("Scannez le QR personnel du client — le scan affiche sa fiche, la visite n'est validée qu'après votre confirmation.")}
                </p>
            </div>

            {/* ------------------------------------------------ scanner zone */}
            {!card && !success && (
                <Card>
                    <CardContent className="p-5">
                        {scanning ? (
                            <div className="space-y-3">
                                <div className="relative overflow-hidden rounded-md border border-accent/30 bg-black">
                                    <video ref={videoRef} playsInline muted className="h-72 w-full object-cover sm:h-96" />
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <div className="h-48 w-48 rounded-md border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-medium text-white/80">
                                        {t('Placez le QR code dans le cadre')}
                                    </div>
                                </div>
                                <Button type="button" variant="outline" className="w-full" onClick={stopCamera}>
                                    <CameraOff />
                                    {t('Fermer la caméra')}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center py-8">
                                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/[0.12] ring-1 ring-accent/25">
                                    <QrCode className="h-7 w-7 text-accent" />
                                </span>
                                <Button
                                    type="button"
                                    variant="accent"
                                    size="lg"
                                    className="mt-6"
                                    onClick={() => void startCamera()}
                                >
                                    <Camera />
                                    {t('Ouvrir la caméra')}
                                </Button>
                                {cameraError && (
                                    <p className="mt-4 max-w-sm text-center text-xs text-destructive">{cameraError}</p>
                                )}

                                <div className="mt-8 w-full max-w-sm">
                                    <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                                        {t('ou saisie manuelle')}
                                    </p>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                                            <Input
                                                value={manualToken}
                                                onChange={(event) => setManualToken(event.target.value)}
                                                placeholder={t("Code de l'abonnement")}
                                                className="pl-10"
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' && manualToken.trim()) {
                                                        lookupMutation.mutate(extractToken(manualToken));
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={!manualToken.trim() || lookupMutation.isPending}
                                            onClick={() => lookupMutation.mutate(extractToken(manualToken))}
                                        >
                                            {lookupMutation.isPending ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                                        </Button>
                                    </div>
                                </div>

                                {lookupError && (
                                    <div className="mt-5 flex w-full max-w-sm items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                                        <XCircle className="h-4 w-4 shrink-0" />
                                        {lookupError}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ------------------------------------------------ success */}
            {success && (
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="border-success/30">
                        <CardContent className="flex flex-col items-center p-8 text-center">
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-success/[0.15]"
                            >
                                <CheckCircle2 className="h-9 w-9 text-success" />
                            </motion.span>
                            <h3 className="mt-4 text-xl font-semibold tracking-tight text-success">{t('VISITE VALIDÉE')}</h3>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {success.service_name} · {card?.client.name}
                            </p>
                            {success.remaining.total_remaining !== null && (
                                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                                    {success.remaining.total_remaining}{' '}
                                    <span className="text-sm font-medium text-muted-foreground">
                                        {success.remaining.total_remaining > 1 ? t('visites restantes') : t('visite restante')}
                                    </span>
                                </p>
                            )}
                            {success.remaining.period_remaining !== null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {success.remaining.period_remaining}{' '}
                                    {success.remaining.period_remaining > 1 ? t('restantes sur la période en cours') : t('restante sur la période en cours')}
                                </p>
                            )}
                            <div className="mt-6 flex gap-2">
                                <Button type="button" variant="outline" onClick={() => setSuccess(null)}>
                                    {t('Voir la fiche')}
                                </Button>
                                <Button type="button" variant="accent" onClick={reset}>
                                    <ScanLine />
                                    {t('Scanner à nouveau')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* ------------------------------------------------ subscription card */}
            {card && !success && (
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <Card>
                        <CardContent className="p-5">
                            {/* Client + status */}
                            <div className="flex flex-wrap items-center gap-4">
                                <EmployeeAvatar name={card.client.name} color={card.client.avatar_color ?? '#C8A24C'} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-lg font-semibold uppercase tracking-tight">
                                        {card.client.name}
                                    </p>
                                    <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                                        {card.client.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="h-3 w-3" />
                                                {card.client.phone}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <ShieldCheck className="h-3 w-3" />
                                            {card.plan.name}
                                        </span>
                                    </p>
                                </div>
                                {status && <Badge variant={status.variant}>{t(status.label)}</Badge>}
                            </div>

                            {/* Block reason */}
                            {!card.usable && card.block_reason && (
                                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
                                    <p className="text-sm font-semibold uppercase tracking-wide text-destructive">
                                        {card.block_reason}
                                    </p>
                                    {card.subscription.renewable &&
                                        ['expired', 'cancelled'].includes(card.subscription.status) &&
                                        hasPermission('subscriptions.sell') && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="mt-3"
                                                onClick={() => navigate(`/abonnements?renew=${card.subscription.id}`)}
                                            >
                                                <RefreshCw />
                                                {t('Renouveler')}
                                            </Button>
                                        )}
                                </div>
                            )}

                            {/* Key facts */}
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <FactTile label={t("Valable jusqu'au")} value={formatDate(card.subscription.ends_on)} />
                                <FactTile
                                    label={t('Visites utilisées')}
                                    value={
                                        card.total_visits !== null
                                            ? `${card.used_visits} / ${card.total_visits}`
                                            : `${card.used_visits}`
                                    }
                                />
                                <FactTile
                                    label={t('Restantes')}
                                    value={
                                        card.total_visits !== null
                                            ? String(Math.max(0, card.total_visits - card.used_visits))
                                            : t('Illimité')
                                    }
                                    accent
                                />
                                <FactTile
                                    label={t("Aujourd'hui")}
                                    value={card.rules.day_allowed ? t('AUTORISÉ') : t('REFUSÉ')}
                                    tone={card.rules.day_allowed ? 'success' : 'destructive'}
                                />
                            </div>

                            {/* Rules strip */}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {card.rules.time_start && card.rules.time_end && (
                                    <RuleChip
                                        ok={card.rules.time_allowed}
                                        label={t('Horaire {start} → {end}', { start: card.rules.time_start, end: card.rules.time_end })}
                                    />
                                )}
                                {card.rules.allowed_days.length > 0 && (
                                    <RuleChip
                                        ok={card.rules.day_allowed}
                                        label={card.rules.allowed_days.map((day) => t(DAY_SHORT[day])).join(' · ')}
                                    />
                                )}
                                {card.rules.min_interval_minutes !== null && (
                                    <RuleChip
                                        ok={card.rules.interval_ok}
                                        label={
                                            card.rules.interval_ok
                                                ? t('Intervalle {x}', { x: formatInterval(card.rules.min_interval_minutes) })
                                                : t('Prochaine visite : {x}', { x: card.rules.next_allowed_at ?? '' })
                                        }
                                    />
                                )}
                                {(Object.entries(card.rules.caps) as Array<['day' | 'week' | 'month', { limit: number | null; count: number; reached: boolean }]>)
                                    .filter(([, cap]) => cap.limit !== null)
                                    .map(([period, cap]) => (
                                        <RuleChip
                                            key={period}
                                            ok={!cap.reached}
                                            label={`${cap.count}/${cap.limit} ${period === 'day' ? t('aujourd’hui') : period === 'week' ? t('cette semaine') : t('ce mois')}`}
                                        />
                                    ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Service + employee + validate */}
                    {card.usable && (
                        <Card>
                            <CardContent className="space-y-4 p-5">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('Service de la visite')}
                                    </p>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {card.services.map((service) => (
                                            <ServiceOption
                                                key={service.plan_service_id}
                                                service={service}
                                                selected={selectedPlanServiceId === service.plan_service_id}
                                                onSelect={() => setSelectedPlanServiceId(service.plan_service_id)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {canSelectEmployee ? (
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                            {t('Employé qui réalise le service')}
                                        </p>
                                        <select
                                            value={employeeId}
                                            onChange={(event) =>
                                                setEmployeeId(event.target.value ? Number(event.target.value) : '')
                                            }
                                            className="mt-2 flex h-11 w-full rounded-md border border-input bg-tint/[0.03] px-3.5 text-sm text-foreground shadow-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10"
                                        >
                                            <option value="">{t('Sélectionner un employé…')}</option>
                                            {employees
                                                .filter((employee) => employee.is_active)
                                                .map((employee) => (
                                                    <option key={employee.id} value={employee.id}>
                                                        {employee.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3.5 py-3 text-sm text-muted-foreground">
                                        {t('Visite rattachee a votre compte employe.')}
                                    </div>
                                )}

                                {validateError && (
                                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                        <p className="text-sm font-medium text-destructive">{validateError}</p>
                                    </div>
                                )}

                                <Button
                                    type="button"
                                    variant="accent"
                                    size="lg"
                                    className="w-full"
                                    disabled={!canValidate}
                                    onClick={() => {
                                        if (cardToken && selectedPlanServiceId && effectiveEmployeeId !== '') {
                                            validateMutation.mutate({
                                                token: cardToken,
                                                planServiceId: selectedPlanServiceId,
                                                employee: effectiveEmployeeId,
                                            });
                                        }
                                    }}
                                >
                                    {validateMutation.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <CheckCircle2 />
                                    )}
                                    {t('Valider la visite')}
                                    {selectedService ? ` — ${selectedService.name}` : ''}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Recent usages */}
                    {card.recent_usages.length > 0 && (
                        <Card>
                            <CardContent className="p-5">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    <History className="h-3.5 w-3.5" />
                                    {t('Dernières visites')}
                                </p>
                                <div className="mt-3 space-y-1.5">
                                    {card.recent_usages.map((usage, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] px-3.5 py-2"
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                                <span className="truncate text-sm">{usage.service_name}</span>
                                                {usage.employee_name && (
                                                    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                                                        <User className="h-3 w-3" />
                                                        {usage.employee_name}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                {usage.used_at
                                                    ? `${formatDate(usage.used_at)} · ${formatTime(usage.used_at)}`
                                                    : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Button type="button" variant="outline" className="w-full" onClick={reset}>
                        <ScanLine />
                        {t('Scanner à nouveau')}
                    </Button>
                </motion.div>
            )}
        </motion.div>
    );
}

function formatInterval(minutes: number): string {
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes} min`;
}

function FactTile({
    label,
    value,
    accent = false,
    tone,
}: {
    label: string;
    value: string;
    accent?: boolean;
    tone?: 'success' | 'destructive';
}) {
    return (
        <div className="rounded-md border border-tint/[0.08] bg-tint/[0.025] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">{label}</p>
            <p
                className={cn(
                    'mt-1 text-sm font-bold tabular-nums',
                    accent && 'text-accent',
                    tone === 'success' && 'text-success',
                    tone === 'destructive' && 'text-destructive',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function RuleChip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span
            className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                ok
                    ? 'border-success/25 bg-success/[0.08] text-success'
                    : 'border-destructive/25 bg-destructive/[0.08] text-destructive',
            )}
        >
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {label}
        </span>
    );
}

function ServiceOption({
    service,
    selected,
    onSelect,
}: {
    service: ScanCardService;
    selected: boolean;
    onSelect: () => void;
}) {
    const { t } = useI18n();
    const exhausted = !service.unlimited && (service.total_remaining ?? 1) <= 0;

    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={exhausted}
            className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-all duration-200',
                selected
                    ? 'border-accent/60 bg-accent/[0.12] shadow-glow'
                    : 'border-tint/[0.08] bg-tint/[0.03] hover:border-accent/30',
                exhausted && 'cursor-not-allowed opacity-50',
            )}
        >
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{service.name}</span>
                <span className="block text-xs text-muted-foreground">
                    {service.unlimited
                        ? t('Illimité')
                        : service.total_remaining !== null
                          ? `${service.total_remaining} ${service.total_remaining > 1 ? t('restantes') : t('restante')}`
                          : service.period_remaining !== null
                            ? `${service.period_remaining} ${service.period_remaining > 1 ? t('restantes') : t('restante')} ${service.quota_period === 'day' ? t('cette journée') : service.quota_period === 'week' ? t('cette semaine') : t('cette période')}`
                            : ''}
                </span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground line-through">
                {formatCurrency(service.price, { maximumFractionDigits: 0 })}
            </span>
        </button>
    );
}
