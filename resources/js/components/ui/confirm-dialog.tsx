import type { ReactNode } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    /** Extra content (options, warnings…) rendered between the description and the buttons. */
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ButtonProps['variant'];
    loading?: boolean;
    onConfirm: () => void;
}

/**
 * Shared confirmation dialog for destructive/irreversible actions — replaces
 * ad-hoc `window.confirm()` calls with something styled and themeable.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    variant = 'destructive',
    loading = false,
    onConfirm,
}: ConfirmDialogProps) {
    const { t } = useI18n();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/[0.12]">
                            <TriangleAlert className="h-5 w-5 text-destructive" />
                        </span>
                        <DialogTitle>{t(title)}</DialogTitle>
                    </div>
                    {description && <DialogDescription>{t(description)}</DialogDescription>}
                </DialogHeader>

                {children}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        {t(cancelLabel)}
                    </Button>
                    <Button type="button" variant={variant} onClick={onConfirm} disabled={loading}>
                        {loading && <Loader2 className="animate-spin" />}
                        {t(confirmLabel)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
