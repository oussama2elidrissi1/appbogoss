import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Gift, Loader2, Scissors, ShieldCheck } from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { checkJoinAvailable, getErrorMessage, joinLoyaltyProgram, requestOtp, verifyOtp } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const joinSchema = z.object({
    first_name: z.string().min(1, 'Le prénom est requis.'),
    last_name: z.string().min(1, 'Le nom est requis.'),
    phone: z.string().min(9, 'Numéro de téléphone invalide.'),
    email: z.string().email('Format d’email invalide.').optional().or(z.literal('')),
    terms_consent: z.boolean().refine((v) => v, { message: 'Vous devez accepter les conditions.' }),
    marketing_consent: z.boolean().optional(),
});

type JoinValues = z.infer<typeof joinSchema>;

type Step = 'checking' | 'unavailable' | 'form' | 'otp';

export default function Join() {
    const navigate = useNavigate();
    const { setClient } = usePortalAuth();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('t') ?? '';

    const [step, setStep] = useState<Step>('checking');
    const [formError, setFormError] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [devCode, setDevCode] = useState<string | null>(null);
    const [otpError, setOtpError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [requestingOtp, setRequestingOtp] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<JoinValues>({
        resolver: zodResolver(joinSchema),
        defaultValues: {
            first_name: '',
            last_name: '',
            phone: '',
            email: '',
            terms_consent: false,
            marketing_consent: false,
        },
    });

    useEffect(() => {
        if (!token) {
            setStep('unavailable');
            return;
        }
        let cancelled = false;
        checkJoinAvailable(token)
            .then((available) => {
                if (!cancelled) setStep(available ? 'form' : 'unavailable');
            })
            .catch(() => {
                if (!cancelled) setStep('unavailable');
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    const sendCode = async (targetPhone: string) => {
        setOtpError(null);
        setRequestingOtp(true);
        try {
            const result = await requestOtp(targetPhone);
            setDevCode(result.dev_code);
            setStep('otp');
        } catch (error) {
            setFormError(getErrorMessage(error, 'Impossible d’envoyer le code.'));
        } finally {
            setRequestingOtp(false);
        }
    };

    const onSubmit = async (values: JoinValues) => {
        setFormError(null);
        try {
            await joinLoyaltyProgram({
                first_name: values.first_name,
                last_name: values.last_name,
                phone: values.phone,
                email: values.email || undefined,
                terms_consent: values.terms_consent,
                marketing_consent: values.marketing_consent,
                token,
            });
            setPhone(values.phone);
            await sendCode(values.phone);
        } catch (error) {
            setFormError(getErrorMessage(error, 'Inscription impossible.'));
        }
    };

    const onVerify = async () => {
        setOtpError(null);
        setVerifying(true);
        try {
            const client = await verifyOtp(phone, code);
            setClient(client);
            navigate('/mon-compte', { replace: true });
        } catch (error) {
            setOtpError(getErrorMessage(error, 'Code invalide.'));
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="grain relative flex min-h-screen items-center justify-center bg-background px-5 py-12">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                className="w-full max-w-[420px]"
            >
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                        <Scissors className="h-6 w-6 text-accent" />
                    </span>
                    <div className="text-lg font-semibold tracking-tight">
                        BOGOS<span className="text-accent">LAND</span>
                    </div>
                </div>

                {step === 'checking' && (
                    <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <p className="text-sm">Chargement…</p>
                    </div>
                )}

                {step === 'unavailable' && (
                    <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-6 text-center">
                        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
                        <h1 className="mt-4 text-lg font-semibold tracking-tight">Inscriptions indisponibles</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            Ce lien n’est plus valide ou les inscriptions sont temporairement fermées. Demandez le
                            QR Code à jour au comptoir.
                        </p>
                    </div>
                )}

                {step === 'form' && (
                    <>
                        <div className="mb-6 flex items-center gap-3 rounded-md border border-accent/20 bg-accent/[0.06] p-4">
                            <Gift className="h-5 w-5 shrink-0 text-accent" />
                            <p className="text-sm leading-relaxed">
                                Rejoignez le programme de fidélité BOGOSLAND et cumulez des avantages à chaque
                                visite.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="first_name">Prénom</Label>
                                    <Input id="first_name" autoComplete="given-name" {...register('first_name')} />
                                    {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_name">Nom</Label>
                                    <Input id="last_name" autoComplete="family-name" {...register('last_name')} />
                                    {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Téléphone</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    autoComplete="tel"
                                    placeholder="06 12 34 56 78"
                                    {...register('phone')}
                                />
                                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email (optionnel)</Label>
                                <Input id="email" type="email" autoComplete="email" {...register('email')} />
                                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                            </div>

                            <label className="flex items-start gap-2.5 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-accent" {...register('terms_consent')} />
                                <span className="leading-relaxed text-muted-foreground">
                                    J’accepte les conditions d’utilisation du programme de fidélité BOGOSLAND.
                                </span>
                            </label>
                            {errors.terms_consent && <p className="text-xs text-destructive">{errors.terms_consent.message}</p>}

                            <label className="flex items-start gap-2.5 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-accent" {...register('marketing_consent')} />
                                <span className="leading-relaxed text-muted-foreground">
                                    J’accepte de recevoir des offres et actualités par SMS/email.
                                </span>
                            </label>

                            {formError && (
                                <div role="alert" className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                    <p className="text-sm text-destructive">{formError}</p>
                                </div>
                            )}

                            <Button type="submit" variant="accent" size="lg" disabled={isSubmitting || requestingOtp} className="group w-full">
                                {isSubmitting || requestingOtp ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Inscription…
                                    </>
                                ) : (
                                    <>
                                        Rejoindre
                                        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </>
                )}

                {step === 'otp' && (
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
                                className={cn('text-center text-lg tracking-[0.3em]', otpError && 'border-destructive/60')}
                            />
                            {otpError && <p className="text-xs text-destructive">{otpError}</p>}
                        </div>

                        <Button
                            type="button"
                            variant="accent"
                            size="lg"
                            className="w-full"
                            disabled={verifying || code.length !== 6}
                            onClick={onVerify}
                        >
                            {verifying ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Vérification…
                                </>
                            ) : (
                                'Valider et accéder à mon espace'
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            disabled={requestingOtp}
                            onClick={() => void sendCode(phone)}
                        >
                            Renvoyer le code
                        </Button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
