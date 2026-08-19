import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, Camera, Check, KeyRound, Loader2, Trash2 } from 'lucide-react';
import {
    getErrorMessage,
    getPartnerPortalProfile,
    removePartnerPortalLogo,
    updatePartnerPortalPassword,
    updatePartnerPortalProfile,
    uploadPartnerPortalLogo,
} from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { pageFade } from '@/lib/motion';
import type { PartnerProfilePayload } from '@/types/partner-portal';

const EMPTY_FORM: PartnerProfilePayload = {
    contact_name: '',
    phone: '',
    email: '',
    trade_name: '',
    legal_name: '',
    ice: '',
    address: '',
    city: '',
    country: '',
    payment_holder_name: '',
    payment_bank_name: '',
    payment_iban: '',
    payment_method_preference: '',
};

export default function PartnerProfile() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState<PartnerProfilePayload>(EMPTY_FORM);
    const [saved, setSaved] = useState(false);

    const { data: profile, isPending } = useQuery({
        queryKey: ['partner-portal', 'profile'],
        queryFn: getPartnerPortalProfile,
    });

    useEffect(() => {
        if (!profile) return;
        setForm({
            contact_name: profile.contact_name ?? '',
            phone: profile.phone ?? '',
            email: profile.email ?? '',
            trade_name: profile.trade_name ?? '',
            legal_name: profile.legal_name ?? '',
            ice: profile.ice ?? '',
            address: profile.address ?? '',
            city: profile.city ?? '',
            country: profile.country ?? '',
            payment_holder_name: profile.payment_holder_name ?? '',
            payment_bank_name: profile.payment_bank_name ?? '',
            payment_iban: profile.payment_iban ?? '',
            payment_method_preference: profile.payment_method_preference ?? '',
        });
    }, [profile]);

    function invalidate() {
        void queryClient.invalidateQueries({ queryKey: ['partner-portal', 'profile'] });
    }

    const saveMutation = useMutation({
        mutationFn: () => updatePartnerPortalProfile(form),
        onSuccess: () => {
            invalidate();
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        },
    });

    const logoMutation = useMutation({
        mutationFn: (file: File) => uploadPartnerPortalLogo(file),
        onSuccess: invalidate,
    });

    const removeLogoMutation = useMutation({
        mutationFn: removePartnerPortalLogo,
        onSuccess: invalidate,
    });

    function field<K extends keyof PartnerProfilePayload>(key: K) {
        return {
            value: form[key] ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((current) => ({ ...current, [key]: event.target.value })),
        };
    }

    if (isPending || !profile) {
        return (
            <div className="mx-auto max-w-2xl space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full rounded-md" />
            </div>
        );
    }

    return (
        <motion.div variants={pageFade} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Identité, entreprise et informations de paiement.
                </p>
            </div>

            <Card className="flex items-center gap-4 p-5 sm:p-6">
                <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/[0.14] text-lg font-semibold text-accent ring-1 ring-accent/25">
                    {profile.logo_url ? (
                        <img src={profile.logo_url} alt={profile.name} className="h-full w-full object-cover" />
                    ) : (
                        getInitials(profile.trade_name || profile.name)
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{profile.trade_name || profile.name}</p>
                    <p className="truncate text-xs text-muted-foreground">Logo affiché dans votre espace</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) logoMutation.mutate(file);
                            event.target.value = '';
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={logoMutation.isPending}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {logoMutation.isPending ? <Loader2 className="animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        Changer
                    </Button>
                    {profile.logo_url && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Retirer le logo"
                            disabled={removeLogoMutation.isPending}
                            onClick={() => removeLogoMutation.mutate()}
                        >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                    )}
                </div>
            </Card>

            <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Identité</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Nom du contact" id="contact_name" {...field('contact_name')} />
                    <FormField label="Téléphone" id="phone" {...field('phone')} />
                    <FormField label="Email" id="email" type="email" {...field('email')} />
                    <FormField label="Email de connexion" id="login_email" value={profile.login_email ?? ''} disabled />
                </div>
            </Card>

            <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Entreprise / activité
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Nom commercial" id="trade_name" {...field('trade_name')} />
                    <FormField label="Raison sociale" id="legal_name" {...field('legal_name')} />
                    <FormField label="ICE" id="ice" {...field('ice')} />
                    <FormField label="Ville" id="city" {...field('city')} />
                    <FormField label="Adresse" id="address" className="sm:col-span-2" {...field('address')} />
                    <FormField label="Pays" id="country" {...field('country')} />
                </div>
            </Card>

            <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Informations de paiement
                </h2>
                <p className="text-xs text-muted-foreground">
                    Visibles uniquement par vous et les administrateurs BOGOSLAND autorisés.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Titulaire du compte" id="payment_holder_name" {...field('payment_holder_name')} />
                    <FormField label="Banque" id="payment_bank_name" {...field('payment_bank_name')} />
                    <FormField label="RIB / IBAN" id="payment_iban" className="sm:col-span-2" {...field('payment_iban')} />
                    <FormField
                        label="Méthode préférée"
                        id="payment_method_preference"
                        placeholder="Virement, chèque..."
                        {...field('payment_method_preference')}
                    />
                </div>
            </Card>

            {saveMutation.isError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                    <p className="text-xs text-destructive">{getErrorMessage(saveMutation.error)}</p>
                </div>
            )}

            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    variant="accent"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                >
                    {saveMutation.isPending ? <Loader2 className="animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                    {saved ? 'Enregistré' : 'Enregistrer les modifications'}
                </Button>
            </div>

            <PasswordCard />
        </motion.div>
    );
}

function FormField({
    label,
    id,
    value,
    onChange,
    type = 'text',
    disabled,
    placeholder,
    className,
}: {
    label: string;
    id: string;
    value: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}) {
    return (
        <div className={`space-y-1.5 ${className ?? ''}`}>
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type={type} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} />
        </div>
    );
}

function PasswordCard() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [done, setDone] = useState(false);

    const mutation = useMutation({
        mutationFn: () =>
            updatePartnerPortalPassword({
                current_password: currentPassword,
                password,
                password_confirmation: confirmation,
            }),
        onSuccess: () => {
            setCurrentPassword('');
            setPassword('');
            setConfirmation('');
            setDone(true);
            setTimeout(() => setDone(false), 2500);
        },
    });

    const canSubmit = currentPassword.length > 0 && password.length >= 8 && password === confirmation;

    return (
        <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                Mot de passe
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                    label="Mot de passe actuel"
                    id="current_password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <FormField
                    label="Nouveau mot de passe"
                    id="new_password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                />
                <FormField
                    label="Confirmer"
                    id="confirm_password"
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                />
            </div>
            {mutation.isError && <p className="text-xs text-destructive">{getErrorMessage(mutation.error)}</p>}
            <Button type="button" variant="outline" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? <Loader2 className="animate-spin" /> : done ? <Check className="h-4 w-4" /> : null}
                {done ? 'Modifié' : 'Modifier le mot de passe'}
            </Button>
        </Card>
    );
}
