import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Loader2, Lock, Phone, Scissors } from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getErrorMessage, loginClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Returning-customer login — phone + the password chosen at /join. New customers register at /join instead. */
export default function PortalLogin() {
    const { client, isLoading, setClient } = usePortalAuth();
    const navigate = useNavigate();

    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!isLoading && client) return <Navigate to="/mon-compte" replace />;

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const verifiedClient = await loginClient(phone, password);
            setClient(verifiedClient);
            navigate('/mon-compte', { replace: true });
        } catch (e) {
            setError(getErrorMessage(e, 'Numéro ou mot de passe incorrect.'));
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

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Téléphone</Label>
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

                    <div className="space-y-2">
                        <Label htmlFor="password">Mot de passe</Label>
                        <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                className="pl-10"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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
                        type="submit"
                        variant="accent"
                        size="lg"
                        className="group w-full"
                        disabled={busy || phone.trim().length < 9 || password.length < 1}
                    >
                        {busy ? (
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

                    <p className="text-center text-xs text-muted-foreground">
                        Pas encore inscrit ? Scannez le QR Code affiché au salon.
                    </p>
                </form>
            </motion.div>
        </div>
    );
}
