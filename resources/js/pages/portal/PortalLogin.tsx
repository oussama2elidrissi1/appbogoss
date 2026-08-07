import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Loader2, Phone, Scissors, ShieldCheck } from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getErrorMessage, requestOtp, verifyOtp } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Returning-customer login — phone + OTP only, no registration form. New customers arrive via /join instead. */
export default function PortalLogin() {
    const { client, isLoading, setClient } = usePortalAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<'phone' | 'otp'>('phone');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [devCode, setDevCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!isLoading && client) return <Navigate to="/mon-compte" replace />;

    const onRequestCode = async () => {
        setError(null);
        setBusy(true);
        try {
            const result = await requestOtp(phone);
            setDevCode(result.dev_code);
            setStep('otp');
        } catch (e) {
            setError(getErrorMessage(e, 'Impossible d’envoyer le code.'));
        } finally {
            setBusy(false);
        }
    };

    const onVerify = async () => {
        setError(null);
        setBusy(true);
        try {
            const verifiedClient = await verifyOtp(phone, code);
            setClient(verifiedClient);
            navigate('/mon-compte', { replace: true });
        } catch (e) {
            setError(getErrorMessage(e, 'Code invalide.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grain relative flex min-h-screen items-center justify-center bg-background px-5 py-12">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                className="w-full max-w-[380px]"
            >
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                        <Scissors className="h-6 w-6 text-accent" />
                    </span>
                    <div>
                        <div className="text-lg font-semibold tracking-tight">
                            BOGOS<span className="text-accent">LAND</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Mon espace fidélité</p>
                    </div>
                </div>

                {step === 'phone' ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Votre numéro de téléphone</Label>
                            <div className="relative">
                                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    id="phone"
                                    type="tel"
                                    autoComplete="tel"
                                    placeholder="06 12 34 56 78"
                                    className="pl-10"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </div>
                        </div>

                        {error && (
                            <div role="alert" className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        <Button
                            type="button"
                            variant="accent"
                            size="lg"
                            className="group w-full"
                            disabled={busy || phone.trim().length < 9}
                            onClick={() => void onRequestCode()}
                        >
                            {busy ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Envoi…
                                </>
                            ) : (
                                <>
                                    Recevoir le code
                                    <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                </>
                            )}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                            Pas encore inscrit ? Scannez le QR Code affiché au salon.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3 rounded-md border border-tint/[0.06] bg-tint/[0.02] p-4">
                            <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                Un code à 6 chiffres a été envoyé au {phone}.
                            </p>
                        </div>

                        {devCode && (
                            <p className="rounded-md bg-tint/[0.03] px-3 py-2 text-center font-mono text-sm text-muted-foreground">
                                Code de test : {devCode}
                            </p>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="code">Code de vérification</Label>
                            <Input
                                id="code"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className={cn('text-center text-lg tracking-[0.3em]', error && 'border-destructive/60')}
                            />
                            {error && <p className="text-xs text-destructive">{error}</p>}
                        </div>

                        <Button
                            type="button"
                            variant="accent"
                            size="lg"
                            className="w-full"
                            disabled={busy || code.length !== 6}
                            onClick={() => void onVerify()}
                        >
                            {busy ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Vérification…
                                </>
                            ) : (
                                'Accéder à mon espace'
                            )}
                        </Button>

                        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => void onRequestCode()}>
                            Renvoyer le code
                        </Button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
