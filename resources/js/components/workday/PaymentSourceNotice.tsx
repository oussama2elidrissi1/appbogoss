import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * D'où sort l'argent — la mention qui doit être lue avant toute autre.
 *
 * Un seul composant pour les deux sources, et c'est délibéré : c'est ce qui
 * garantit qu'une opération de caisse et une opération de portefeuille se
 * présentent au même endroit, avec la même forme, et ne peuvent donc pas être
 * confondues d'un écran à l'autre.
 *
 * Le vert est le portefeuille (l'argent que l'admin détient), le bleu la
 * caisse du jour (le tiroir). Le gris signale une opération dont l'argent ne
 * sort d'aucun des deux — un versement enregistré sans trace de mouvement.
 */
export type PaymentSource = 'wallet' | 'caisse' | 'none';

const PRESETS: Record<
    PaymentSource,
    { dot: string; frame: string; label: string }
> = {
    wallet: {
        dot: 'bg-emerald-500',
        frame: 'border-emerald-500/30 bg-emerald-500/[0.07]',
        label: 'Portefeuille Admin',
    },
    caisse: {
        dot: 'bg-sky-500',
        frame: 'border-sky-500/30 bg-sky-500/[0.07]',
        label: 'Caisse du jour',
    },
    none: {
        dot: 'bg-muted-foreground',
        frame: 'border-tint/[0.10] bg-tint/[0.03]',
        label: 'Aucune sortie enregistrée',
    },
};

export function PaymentSourceNotice({
    source,
    detail,
    label,
    className,
}: {
    source: PaymentSource;
    /** Ce que l'opération va faire — en une phrase, sans jargon. */
    detail: string;
    /** Remplace le libellé par défaut de la source. */
    label?: string;
    className?: string;
}) {
    const { t } = useI18n();
    const preset = PRESETS[source];

    return (
        <div className={cn('rounded-md border px-3 py-2.5', preset.frame, className)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t('Source du paiement')}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', preset.dot)} />
                {t(label ?? preset.label)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(detail)}</p>
        </div>
    );
}

/** La même information, en une pastille, pour une ligne de tableau. */
export function PaymentSourceTag({ source }: { source: PaymentSource }) {
    const { t } = useI18n();
    const preset = PRESETS[source];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                preset.frame,
            )}
        >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', preset.dot)} />
            {t(source === 'wallet' ? 'Wallet' : source === 'caisse' ? 'Caisse' : '—')}
        </span>
    );
}
