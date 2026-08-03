import { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PatronPasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    tone?: ButtonProps['variant'];
    loading?: boolean;
    /** Server-side error message (e.g. "Mot de passe patron incorrect."). Never validated client-side. */
    error?: string | null;
    onConfirm: (password: string) => void;
}

/**
 * Requires the patron-only password before an irreversible action proceeds
 * (e.g. deleting a salary advance entered by mistake). The password is only
 * ever checked server-side with hash_equals() — this dialog just collects it.
 */
export function PatronPasswordDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Supprimer définitivement',
    tone = 'destructive',
    loading = false,
    error,
    onConfirm,
}: PatronPasswordDialogProps) {
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (open) setPassword('');
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <span
                            className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                tone === 'destructive' ? 'bg-destructive/[0.12]' : 'bg-accent/[0.12]',
                            )}
                        >
                            <KeyRound
                                className={cn('h-5 w-5', tone === 'destructive' ? 'text-destructive' : 'text-accent')}
                            />
                        </span>
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    <DialogDescription>
                        {description ?? 'Cette action est irréversible. Le mot de passe patron est requis.'}
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (password) onConfirm(password);
                    }}
                >
                    <div className="space-y-2">
                        <Label htmlFor="patron-password">Mot de passe patron</Label>
                        <Input
                            id="patron-password"
                            type="password"
                            autoFocus
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3.5 py-3">
                            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Annuler
                        </Button>
                        <Button type="submit" variant={tone} disabled={loading || !password}>
                            {loading && <Loader2 className="animate-spin" />}
                            {confirmLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
