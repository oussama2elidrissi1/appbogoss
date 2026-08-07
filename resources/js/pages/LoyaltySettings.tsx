import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Bell, Gift, QrCode, Save, Settings as SettingsIcon, ShieldCheck, Timer } from 'lucide-react';
import { getErrorMessage, getLoyaltySettingsFull, updateLoyaltySettings } from '@/lib/api';
import { pageFade } from '@/lib/motion';
import type { LoyaltyNotificationEventSetting, LoyaltyQrPosterLanguage } from '@/types/loyalty';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const POSTER_LANGUAGE_LABELS: Record<LoyaltyQrPosterLanguage, string> = {
    fr: 'Français',
    ar: 'العربية (arabe)',
    both: 'Français + العربية',
};

interface FormState {
    loyalty_enabled: boolean;
    loyalty_number_prefix: string;
    loyalty_timezone: string;
    loyalty_qr_registration_enabled: boolean;
    loyalty_qr_message: string;
    loyalty_qr_poster_language: LoyaltyQrPosterLanguage;
    loyalty_personal_qr_enabled: boolean;
    otp_ttl_seconds: string;
    otp_max_attempts: string;
    otp_resend_cooldown_seconds: string;
    otp_max_sends_per_hour: string;
    loyalty_reward_default_expiry_days: string;
    subscription_expiry_alert_days: string;
    subscription_allow_suspension_default: boolean;
    subscription_allow_renewal_default: boolean;
    notifications: Record<string, LoyaltyNotificationEventSetting>;
}

const emptyForm: FormState = {
    loyalty_enabled: true,
    loyalty_number_prefix: 'FID',
    loyalty_timezone: 'Africa/Casablanca',
    loyalty_qr_registration_enabled: true,
    loyalty_qr_message: '',
    loyalty_qr_poster_language: 'fr',
    loyalty_personal_qr_enabled: true,
    otp_ttl_seconds: '300',
    otp_max_attempts: '5',
    otp_resend_cooldown_seconds: '60',
    otp_max_sends_per_hour: '5',
    loyalty_reward_default_expiry_days: '30',
    subscription_expiry_alert_days: '7',
    subscription_allow_suspension_default: false,
    subscription_allow_renewal_default: true,
    notifications: {},
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={
                'inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
                (checked ? 'bg-accent' : 'bg-tint/[0.12]')
            }
            aria-pressed={checked}
            aria-label={label}
        >
            <span className={'h-5 w-5 rounded-full bg-white shadow transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
    );
}

export default function LoyaltySettings() {
    const queryClient = useQueryClient();
    const settingsQuery = useQuery({ queryKey: ['loyalty-settings'], queryFn: getLoyaltySettingsFull });
    const [form, setForm] = useState<FormState>(emptyForm);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => {
        if (!settingsQuery.data) return;
        const s = settingsQuery.data;
        setForm({
            loyalty_enabled: s.loyalty_enabled,
            loyalty_number_prefix: s.loyalty_number_prefix,
            loyalty_timezone: s.loyalty_timezone,
            loyalty_qr_registration_enabled: s.loyalty_qr_registration_enabled,
            loyalty_qr_message: s.loyalty_qr_message ?? '',
            loyalty_qr_poster_language: s.loyalty_qr_poster_language ?? 'fr',
            loyalty_personal_qr_enabled: s.loyalty_personal_qr_enabled,
            otp_ttl_seconds: String(s.otp_ttl_seconds),
            otp_max_attempts: String(s.otp_max_attempts),
            otp_resend_cooldown_seconds: String(s.otp_resend_cooldown_seconds),
            otp_max_sends_per_hour: String(s.otp_max_sends_per_hour),
            loyalty_reward_default_expiry_days: String(s.loyalty_reward_default_expiry_days),
            subscription_expiry_alert_days: String(s.subscription_expiry_alert_days),
            subscription_allow_suspension_default: s.subscription_allow_suspension_default,
            subscription_allow_renewal_default: s.subscription_allow_renewal_default,
            notifications: s.loyalty_notification_settings ?? {},
        });
    }, [settingsQuery.data]);

    const mutation = useMutation({
        mutationFn: updateLoyaltySettings,
        onSuccess: () => {
            setFeedback('Paramètres de fidélité enregistrés.');
            void queryClient.invalidateQueries({ queryKey: ['loyalty-settings'] });
        },
        onError: (e) => setFeedback(getErrorMessage(e)),
    });

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFeedback(null);
        mutation.mutate({
            loyalty_enabled: form.loyalty_enabled,
            loyalty_number_prefix: form.loyalty_number_prefix,
            loyalty_timezone: form.loyalty_timezone,
            loyalty_qr_registration_enabled: form.loyalty_qr_registration_enabled,
            loyalty_qr_message: form.loyalty_qr_message,
            loyalty_qr_poster_language: form.loyalty_qr_poster_language,
            loyalty_personal_qr_enabled: form.loyalty_personal_qr_enabled,
            otp_ttl_seconds: Number(form.otp_ttl_seconds),
            otp_max_attempts: Number(form.otp_max_attempts),
            otp_resend_cooldown_seconds: Number(form.otp_resend_cooldown_seconds),
            otp_max_sends_per_hour: Number(form.otp_max_sends_per_hour),
            loyalty_reward_default_expiry_days: Number(form.loyalty_reward_default_expiry_days),
            subscription_expiry_alert_days: Number(form.subscription_expiry_alert_days),
            subscription_allow_suspension_default: form.subscription_allow_suspension_default,
            subscription_allow_renewal_default: form.subscription_allow_renewal_default,
            loyalty_notification_settings: form.notifications,
        });
    };

    const toggleEvent = (key: string, field: 'enabled' | 'mail') => {
        setForm((prev) => {
            const current = prev.notifications[key] ?? { enabled: true, channels: ['database'] };
            if (field === 'enabled') {
                return { ...prev, notifications: { ...prev.notifications, [key]: { ...current, enabled: !(current.enabled ?? true) } } };
            }
            const hasMail = (current.channels ?? ['database']).includes('mail');
            const channels = hasMail ? ['database'] : ['database', 'mail'];
            return { ...prev, notifications: { ...prev.notifications, [key]: { ...current, channels } } };
        });
    };

    if (settingsQuery.isPending) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-72 rounded-lg" />
                <Skeleton className="h-64 rounded-lg" />
            </div>
        );
    }

    if (settingsQuery.isError || !settingsQuery.data) {
        return (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <h2 className="mt-4 text-base font-semibold">Impossible de charger les paramètres</h2>
                <p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(settingsQuery.error)}</p>
            </Card>
        );
    }

    const events = settingsQuery.data.notification_events;

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Fidélité — Paramètres</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Réglages du programme de fidélité, de l’inscription publique, de l’OTP et des notifications.
                </p>
            </div>

            {feedback && (
                <div className="rounded-md border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm text-accent">{feedback}</div>
            )}

            <form onSubmit={submit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <SettingsIcon className="h-4 w-4 text-accent" />
                            Général
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Programme de fidélité actif</Label>
                                <p className="mt-1 text-xs text-muted-foreground">Coupe l’accrual global si désactivé.</p>
                            </div>
                            <Toggle
                                checked={form.loyalty_enabled}
                                onChange={(v) => setForm({ ...form, loyalty_enabled: v })}
                                label="Programme actif"
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="prefix">Préfixe du numéro fidélité</Label>
                                <Input
                                    id="prefix"
                                    value={form.loyalty_number_prefix}
                                    maxLength={10}
                                    onChange={(e) => setForm({ ...form, loyalty_number_prefix: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tz">Fuseau horaire</Label>
                                <Input
                                    id="tz"
                                    value={form.loyalty_timezone}
                                    onChange={(e) => setForm({ ...form, loyalty_timezone: e.target.value })}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <QrCode className="h-4 w-4 text-accent" />
                            QR & inscription
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Inscriptions publiques ouvertes</Label>
                            <Toggle
                                checked={form.loyalty_qr_registration_enabled}
                                onChange={(v) => setForm({ ...form, loyalty_qr_registration_enabled: v })}
                                label="Inscriptions ouvertes"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>QR personnel d’identification client actif</Label>
                            <Toggle
                                checked={form.loyalty_personal_qr_enabled}
                                onChange={(v) => setForm({ ...form, loyalty_personal_qr_enabled: v })}
                                label="QR personnel actif"
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                            <div className="space-y-2">
                                <Label htmlFor="qr-message">Message affiché sur l’affiche QR</Label>
                                <Input
                                    id="qr-message"
                                    value={form.loyalty_qr_message}
                                    maxLength={255}
                                    onChange={(e) => setForm({ ...form, loyalty_qr_message: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="qr-lang">Langue de l’affiche</Label>
                                <Select
                                    value={form.loyalty_qr_poster_language}
                                    onValueChange={(v) => setForm({ ...form, loyalty_qr_poster_language: v as LoyaltyQrPosterLanguage })}
                                >
                                    <SelectTrigger id="qr-lang" className="h-11 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(POSTER_LANGUAGE_LABELS) as LoyaltyQrPosterLanguage[]).map((lang) => (
                                            <SelectItem key={lang} value={lang}>
                                                {POSTER_LANGUAGE_LABELS[lang]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Le message ci-dessus reste tel que vous le tapez (français ou arabe) ; la langue choisie
                            ici ne change que les textes fixes de l’affiche imprimable (titre, indication de scan).
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Timer className="h-4 w-4 text-accent" />
                            Vérification par code (OTP)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="otp-ttl">Durée de validité (s)</Label>
                                <Input id="otp-ttl" type="number" min={60} max={1800} value={form.otp_ttl_seconds} onChange={(e) => setForm({ ...form, otp_ttl_seconds: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="otp-attempts">Tentatives max</Label>
                                <Input id="otp-attempts" type="number" min={1} max={10} value={form.otp_max_attempts} onChange={(e) => setForm({ ...form, otp_max_attempts: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="otp-cooldown">Délai avant renvoi (s)</Label>
                                <Input id="otp-cooldown" type="number" min={10} max={600} value={form.otp_resend_cooldown_seconds} onChange={(e) => setForm({ ...form, otp_resend_cooldown_seconds: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="otp-hourly">Plafond par heure</Label>
                                <Input id="otp-hourly" type="number" min={1} max={20} value={form.otp_max_sends_per_hour} onChange={(e) => setForm({ ...form, otp_max_sends_per_hour: e.target.value })} />
                            </div>
                        </div>
                        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                            Fournisseur actif : journal serveur (mode démo, aucun SMS réel envoyé). Le code apparaît dans
                            <code className="mx-1 rounded bg-tint/[0.05] px-1 py-0.5">storage/logs/laravel.log</code>
                            et dans la réponse API en développement.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-4 w-4 text-accent" />
                            Récompenses & abonnements
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="reward-expiry">Expiration par défaut des récompenses (jours)</Label>
                                <Input id="reward-expiry" type="number" min={0} max={365} value={form.loyalty_reward_default_expiry_days} onChange={(e) => setForm({ ...form, loyalty_reward_default_expiry_days: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sub-alert">Alerte d’expiration d’abonnement (jours avant)</Label>
                                <Input id="sub-alert" type="number" min={1} max={60} value={form.subscription_expiry_alert_days} onChange={(e) => setForm({ ...form, subscription_expiry_alert_days: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Suspension autorisée par défaut (nouveaux plans)</Label>
                            <Toggle
                                checked={form.subscription_allow_suspension_default}
                                onChange={(v) => setForm({ ...form, subscription_allow_suspension_default: v })}
                                label="Suspension par défaut"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label>Renouvellement autorisé par défaut (nouveaux plans)</Label>
                            <Toggle
                                checked={form.subscription_allow_renewal_default}
                                onChange={(v) => setForm({ ...form, subscription_allow_renewal_default: v })}
                                label="Renouvellement par défaut"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="h-4 w-4 text-accent" />
                            Notifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y divide-tint/[0.06]">
                            {Object.entries(events).map(([key, label]) => {
                                const setting = form.notifications[key];
                                const enabled = setting?.enabled ?? true;
                                const mailOn = (setting?.channels ?? ['database']).includes('mail');
                                return (
                                    <div key={key} className="flex items-center justify-between gap-4 py-3">
                                        <span className="text-sm text-foreground">{label}</span>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5 rounded accent-accent"
                                                    checked={mailOn}
                                                    disabled={!enabled}
                                                    onChange={() => toggleEvent(key, 'mail')}
                                                />
                                                Aussi par email
                                            </label>
                                            <Toggle checked={enabled} onChange={() => toggleEvent(key, 'enabled')} label={label} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <div className="flex items-center justify-between rounded-md border border-tint/[0.06] bg-tint/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-accent" />
                        Réservé au Super Admin.
                    </div>
                    <Button type="submit" variant="accent" disabled={mutation.isPending}>
                        <Save />
                        {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </div>
            </form>
        </motion.div>
    );
}
