import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, Scissors, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
    email: z.string().min(1, 'L’email est requis.').email('Format d’email invalide.'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
});

type LoginValues = z.infer<typeof loginSchema>;

const highlights = [
    'Agenda temps réel et rappels automatiques',
    'Caisse, stock et dépenses réunis',
    'Rapports de rentabilité par employé',
];

export default function Login() {
    const { user, isLoading, login } = useAuth();
    const navigate = useNavigate();
    const [formError, setFormError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });

    if (!isLoading && user) return <Navigate to="/dashboard" replace />;

    const onSubmit = async (values: LoginValues) => {
        setFormError(null);
        try {
            await login(values.email, values.password);
            navigate('/dashboard', { replace: true });
        } catch (error) {
            setFormError(getErrorMessage(error, 'Identifiants incorrects.'));
        }
    };

    return (
        <div className="grain relative flex min-h-screen bg-background">
            {/* Left — brand panel */}
            <div className="aurora relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/[0.06] p-12 lg:flex xl:p-16">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-3"
                >
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                        <Scissors className="h-5 w-5 text-accent" />
                    </span>
                    <div>
                        <div className="text-base font-semibold leading-none tracking-tight">
                            BOGOS<span className="text-accent">LAND</span>
                        </div>
                        <div className="mt-1 text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-muted-foreground">
                            Manager
                        </div>
                    </div>
                </motion.div>

                <div className="max-w-lg">
                    <motion.h2
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.08 }}
                        className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl"
                    >
                        Le salon,
                        <br />
                        <span className="text-accent">piloté au détail près.</span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.16 }}
                        className="mt-5 text-[15px] leading-relaxed text-muted-foreground"
                    >
                        Rendez-vous, encaissements, stock et performance de l’équipe — réunis dans
                        une interface pensée pour aller vite.
                    </motion.p>

                    <ul className="mt-9 space-y-3.5">
                        {highlights.map((item, index) => (
                            <motion.li
                                key={item}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: 0.24 + index * 0.08 }}
                                className="flex items-center gap-3 text-sm text-muted-foreground"
                            >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/[0.12]">
                                    <Sparkles className="h-3 w-3 text-accent" />
                                </span>
                                {item}
                            </motion.li>
                        ))}
                    </ul>
                </div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="text-xs text-muted-foreground/60"
                >
                    © {new Date().getFullYear()} BOGOSLAND. Tous droits réservés.
                </motion.p>
            </div>

            {/* Right — form */}
            <div className="relative flex w-full items-center justify-center px-5 py-12 lg:w-1/2 lg:px-12">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                    className="w-full max-w-[400px]"
                >
                    {/* Compact brand for small screens */}
                    <div className="mb-10 flex items-center gap-3 lg:hidden">
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/[0.14] ring-1 ring-accent/25">
                            <Scissors className="h-5 w-5 text-accent" />
                        </span>
                        <div className="text-base font-semibold tracking-tight">
                            BOGOS<span className="text-accent">LAND</span>
                        </div>
                    </div>

                    <h1 className="text-[26px] font-semibold tracking-tight">Bon retour</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Connectez-vous pour accéder à votre tableau de bord.
                    </p>

                    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="vous@bogosland.com"
                                    className={cn(
                                        'pl-10',
                                        errors.email && 'border-destructive/60 focus-visible:ring-destructive/15',
                                    )}
                                    aria-invalid={Boolean(errors.email)}
                                    {...register('email')}
                                />
                            </div>
                            {errors.email && (
                                <p className="text-xs text-destructive">{errors.email.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Mot de passe</Label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className={cn(
                                        'pl-10',
                                        errors.password && 'border-destructive/60 focus-visible:ring-destructive/15',
                                    )}
                                    aria-invalid={Boolean(errors.password)}
                                    {...register('password')}
                                />
                            </div>
                            {errors.password && (
                                <p className="text-xs text-destructive">{errors.password.message}</p>
                            )}
                        </div>

                        {formError && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                role="alert"
                                className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3"
                            >
                                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                                <p className="text-sm text-destructive">{formError}</p>
                            </motion.div>
                        )}

                        <Button
                            type="submit"
                            variant="accent"
                            size="lg"
                            disabled={isSubmitting}
                            className="group w-full"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Connexion…
                                </>
                            ) : (
                                <>
                                    Se connecter
                                    <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-8 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Démo :</span>{' '}
                            admin@bogosland.com / password
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
