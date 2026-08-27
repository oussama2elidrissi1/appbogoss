import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Gift, Loader2, Lock, Scissors } from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { checkJoinAvailable, getErrorMessage, joinLoyaltyProgram } from '@/lib/api';
import { t as translateStatic, useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const joinSchema = z
    .object({
        first_name: z.string().min(1, translateStatic('Le prénom est requis.')),
        last_name: z.string().min(1, translateStatic('Le nom est requis.')),
        phone: z.string().min(9, translateStatic('Numéro de téléphone invalide.')),
        password: z.string().min(8, translateStatic('Le mot de passe doit contenir au moins 8 caractères.')),
        password_confirmation: z.string(),
        email: z.string().email(translateStatic('Format d’email invalide.')).optional().or(z.literal('')),
        terms_consent: z.boolean().refine((v) => v, { message: translateStatic('Vous devez accepter les conditions.') }),
        marketing_consent: z.boolean().optional(),
    })
    .refine((values) => values.password === values.password_confirmation, {
        message: translateStatic('Les mots de passe ne correspondent pas.'),
        path: ['password_confirmation'],
    });

type JoinValues = z.infer<typeof joinSchema>;

type Step = 'checking' | 'unavailable' | 'form';

export default function Join() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { setClient } = usePortalAuth();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('t') ?? '';

    const [step, setStep] = useState<Step>('checking');
    const [formError, setFormError] = useState<string | null>(null);

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
            password: '',
            password_confirmation: '',
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

    const onSubmit = async (values: JoinValues) => {
        setFormError(null);
        try {
            const client = await joinLoyaltyProgram({
                first_name: values.first_name,
                last_name: values.last_name,
                phone: values.phone,
                password: values.password,
                password_confirmation: values.password_confirmation,
                email: values.email || undefined,
                terms_consent: values.terms_consent,
                marketing_consent: values.marketing_consent,
                token,
            });
            setClient(client);
            navigate('/mon-compte', { replace: true });
        } catch (error) {
            setFormError(getErrorMessage(error, t('Inscription impossible.')));
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
                        <p className="text-sm">{t('Chargement…')}</p>
                    </div>
                )}

                {step === 'unavailable' && (
                    <div className="rounded-md border border-tint/[0.06] bg-tint/[0.02] p-6 text-center">
                        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
                        <h1 className="mt-4 text-lg font-semibold tracking-tight">{t('Inscriptions indisponibles')}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {t('Ce lien n’est plus valide ou les inscriptions sont temporairement fermées. Demandez le QR Code à jour au comptoir.')}
                        </p>
                    </div>
                )}

                {step === 'form' && (
                    <>
                        <div className="mb-6 flex items-center gap-3 rounded-md border border-accent/20 bg-accent/[0.06] p-4">
                            <Gift className="h-5 w-5 shrink-0 text-accent" />
                            <p className="text-sm leading-relaxed">
                                {t('Rejoignez le programme de fidélité BOGOSLAND et cumulez des avantages à chaque visite.')}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="first_name">{t('Prénom')}</Label>
                                    <Input id="first_name" autoComplete="given-name" {...register('first_name')} />
                                    {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_name">{t('Nom')}</Label>
                                    <Input id="last_name" autoComplete="family-name" {...register('last_name')} />
                                    {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">{t('Téléphone')}</Label>
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
                                <Label htmlFor="email">{t('Email (optionnel)')}</Label>
                                <Input id="email" type="email" autoComplete="email" {...register('email')} />
                                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="password">{t('Mot de passe')}</Label>
                                    <div className="relative">
                                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                        <Input
                                            id="password"
                                            type="password"
                                            autoComplete="new-password"
                                            className="pl-10"
                                            {...register('password')}
                                        />
                                    </div>
                                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password_confirmation">{t('Confirmation')}</Label>
                                    <Input
                                        id="password_confirmation"
                                        type="password"
                                        autoComplete="new-password"
                                        {...register('password_confirmation')}
                                    />
                                    {errors.password_confirmation && (
                                        <p className="text-xs text-destructive">{errors.password_confirmation.message}</p>
                                    )}
                                </div>
                            </div>

                            <label className="flex items-start gap-2.5 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-accent" {...register('terms_consent')} />
                                <span className="leading-relaxed text-muted-foreground">
                                    {t('J’accepte les conditions d’utilisation du programme de fidélité BOGOSLAND.')}
                                </span>
                            </label>
                            {errors.terms_consent && <p className="text-xs text-destructive">{errors.terms_consent.message}</p>}

                            <label className="flex items-start gap-2.5 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-accent" {...register('marketing_consent')} />
                                <span className="leading-relaxed text-muted-foreground">
                                    {t('J’accepte de recevoir des offres et actualités par SMS/email.')}
                                </span>
                            </label>

                            {formError && (
                                <div role="alert" className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                    <p className="text-sm text-destructive">{formError}</p>
                                </div>
                            )}

                            <Button type="submit" variant="accent" size="lg" disabled={isSubmitting} className="group w-full">
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        {t('Inscription…')}
                                    </>
                                ) : (
                                    <>
                                        {t('Rejoindre')}
                                        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                    </>
                                )}
                            </Button>

                            <p className="text-center text-xs text-muted-foreground">
                                {t('Déjà inscrit ?')}{' '}
                                <Link to="/mon-compte/connexion" className="text-accent hover:underline">
                                    {t('Connectez-vous')}
                                </Link>
                            </p>
                        </form>
                    </>
                )}
            </motion.div>
        </div>
    );
}
