import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, ImagePlus, KeyRound, Save, Settings as SettingsIcon, Trash2, UserRound } from 'lucide-react';
import { getErrorMessage, getSettings, removeSettingsLogo, updatePassword, updateProfile, updateSettings } from '@/lib/api';
import { useAuth, ME_QUERY_KEY } from '@/hooks/useAuth';
import { pageFade } from '@/lib/motion';
import type { ApplicationSettingsPayload } from '@/types/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const defaults = { salon_name: '', salon_phone: '', salon_email: '', salon_address: '', currency: 'MAD', receipt_footer: '' };

export default function Settings() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: settings, isPending, isError, error } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
    const [application, setApplication] = useState(defaults);
    const [logo, setLogo] = useState<File | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [profile, setProfile] = useState({ name: '', email: '' });
    const [password, setPassword] = useState({ current_password: '', password: '', password_confirmation: '' });

    useEffect(() => {
        if (settings) setApplication({ salon_name: settings.salon_name, salon_phone: settings.salon_phone, salon_email: settings.salon_email, salon_address: settings.salon_address, currency: settings.currency, receipt_footer: settings.receipt_footer });
    }, [settings]);
    useEffect(() => {
        if (user) setProfile({ name: user.name, email: user.email });
    }, [user]);

    const settingsMutation = useMutation({ mutationFn: updateSettings, onSuccess: (next) => { queryClient.setQueryData(['settings'], next); setLogo(null); setFeedback('Paramètres de l’application enregistrés.'); }, onError: (e) => setFeedback(getErrorMessage(e)) });
    const logoMutation = useMutation({ mutationFn: removeSettingsLogo, onSuccess: (next) => { queryClient.setQueryData(['settings'], next); setFeedback('Logo supprimé.'); }, onError: (e) => setFeedback(getErrorMessage(e)) });
    const profileMutation = useMutation({ mutationFn: updateProfile, onSuccess: (next) => { queryClient.setQueryData(ME_QUERY_KEY, next); setFeedback('Profil administrateur enregistré.'); }, onError: (e) => setFeedback(getErrorMessage(e)) });
    const passwordMutation = useMutation({ mutationFn: updatePassword, onSuccess: () => { setPassword({ current_password: '', password: '', password_confirmation: '' }); setFeedback('Mot de passe modifié avec succès.'); }, onError: (e) => setFeedback(getErrorMessage(e)) });

    function saveApplication(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFeedback(null); const payload: ApplicationSettingsPayload = { ...application, logo }; settingsMutation.mutate(payload); }
    function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFeedback(null); profileMutation.mutate(profile); }
    function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFeedback(null); if (password.password.length < 8) { setFeedback('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; } if (password.password !== password.password_confirmation) { setFeedback('La confirmation du mot de passe est différente.'); return; } passwordMutation.mutate(password); }

    if (isPending) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
    if (isError || !settings) return <Card className="flex flex-col items-center justify-center px-6 py-16 text-center"><AlertCircle className="h-6 w-6 text-destructive" /><h2 className="mt-4 text-base font-semibold">Impossible de charger les paramètres</h2><p className="mt-2 text-sm text-muted-foreground">{getErrorMessage(error)}</p></Card>;

    return <motion.div variants={pageFade} initial="hidden" animate="show" className="space-y-6">
        <div><h2 className="text-2xl font-semibold tracking-tight">Paramètres</h2><p className="mt-1.5 text-sm text-muted-foreground">Identité du salon, tickets, compte administrateur et sécurité.</p></div>
        {feedback && <div className="rounded-md border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm text-accent">{feedback}</div>}
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><SettingsIcon className="h-4 w-4 text-accent" />Application et identité du salon</CardTitle></CardHeader><CardContent><form onSubmit={saveApplication} className="grid grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)]"><div className="space-y-3"><div className="flex h-40 items-center justify-center overflow-hidden rounded-md border border-dashed border-tint/[0.12] bg-tint/[0.025]">{logo ? <span className="px-4 text-center text-sm text-muted-foreground">{logo.name}</span> : settings.logo_url ? <img src={settings.logo_url} alt="Logo du salon" className="max-h-full max-w-full object-contain p-4" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}</div><label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.03] px-3 text-sm hover:border-accent/40"><ImagePlus className="h-4 w-4" /> Choisir un logo<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} /></label>{settings.logo_url && <Button type="button" variant="ghost" className="w-full text-destructive" onClick={() => logoMutation.mutate()} disabled={logoMutation.isPending}><Trash2 /> Supprimer le logo</Button>}</div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label htmlFor="salon-name">Nom du salon</Label><Input id="salon-name" value={application.salon_name} onChange={(e) => setApplication({ ...application, salon_name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="salon-phone">Téléphone</Label><Input id="salon-phone" value={application.salon_phone} onChange={(e) => setApplication({ ...application, salon_phone: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="salon-email">Email</Label><Input id="salon-email" type="email" value={application.salon_email} onChange={(e) => setApplication({ ...application, salon_email: e.target.value })} /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="salon-address">Adresse</Label><Input id="salon-address" value={application.salon_address} onChange={(e) => setApplication({ ...application, salon_address: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="currency">Devise</Label><Input id="currency" value={application.currency} onChange={(e) => setApplication({ ...application, currency: e.target.value.toUpperCase() })} maxLength={8} /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="receipt-footer">Pied du ticket</Label><Input id="receipt-footer" value={application.receipt_footer} onChange={(e) => setApplication({ ...application, receipt_footer: e.target.value })} /></div><div className="flex justify-end md:col-span-2"><Button type="submit" variant="accent" disabled={settingsMutation.isPending}><Save /> {settingsMutation.isPending ? 'Enregistrement...' : 'Enregistrer les paramètres'}</Button></div></div></form></CardContent></Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-accent" />Profil administrateur</CardTitle></CardHeader><CardContent><form onSubmit={saveProfile} className="space-y-4"><div className="space-y-2"><Label htmlFor="profile-name">Nom</Label><Input id="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="profile-email">Email de connexion</Label><Input id="profile-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></div><Button type="submit" variant="accent" disabled={profileMutation.isPending}><Save /> Enregistrer le profil</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-accent" />Sécurité</CardTitle></CardHeader><CardContent><form onSubmit={savePassword} className="space-y-4"><div className="space-y-2"><Label htmlFor="current-password">Mot de passe actuel</Label><Input id="current-password" type="password" autoComplete="current-password" value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="new-password">Nouveau mot de passe</Label><Input id="new-password" type="password" autoComplete="new-password" value={password.password} onChange={(e) => setPassword({ ...password, password: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="password-confirmation">Confirmation</Label><Input id="password-confirmation" type="password" autoComplete="new-password" value={password.password_confirmation} onChange={(e) => setPassword({ ...password, password_confirmation: e.target.value })} /></div><Button type="submit" variant="accent" disabled={passwordMutation.isPending}><KeyRound /> Modifier le mot de passe</Button></form></CardContent></Card></div>
    </motion.div>;
}
