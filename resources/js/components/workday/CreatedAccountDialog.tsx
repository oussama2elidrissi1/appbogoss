import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { CredentialRow } from './CredentialRow';

export interface CreatedAccount {
    employeeName: string;
    loginEmail: string;
    temporaryPassword: string;
}

/** Shows freshly generated login credentials exactly once, with copy-to-clipboard. */
export function CreatedAccountDialog({
    account,
    onClose,
}: {
    account: CreatedAccount | null;
    onClose: () => void;
}) {
    return (
        <Dialog open={account !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Compte créé</DialogTitle>
                    <DialogDescription>
                        Communiquez ces identifiants à {account?.employeeName} — ils ne seront plus affichés
                        ensuite.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <CredentialRow label="Email de connexion" value={account?.loginEmail ?? ''} />
                    <CredentialRow label="Mot de passe" value={account?.temporaryPassword ?? ''} />
                </div>

                <DialogFooter>
                    <Button type="button" variant="accent" onClick={onClose}>
                        Terminé
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
