import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
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
    const { t } = useI18n();

    return (
        <Dialog open={account !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('Compte créé')}</DialogTitle>
                    <DialogDescription>
                        {t('Communiquez ces identifiants à {name} — ils ne seront plus affichés ensuite.', {
                            name: account?.employeeName ?? '',
                        })}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <CredentialRow label={t('Email de connexion')} value={account?.loginEmail ?? ''} />
                    <CredentialRow label={t('Mot de passe')} value={account?.temporaryPassword ?? ''} />
                </div>

                <DialogFooter>
                    <Button type="button" variant="accent" onClick={onClose}>
                        {t('Terminé')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
