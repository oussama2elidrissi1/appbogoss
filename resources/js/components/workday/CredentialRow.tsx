import { useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Label } from '@/components/ui/label';

/** A copy-to-clipboard row for displaying a freshly generated email/password once. */
export function CredentialRow({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const { t } = useI18n();

    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{t(label)}</Label>
            <div className="flex items-center gap-2 rounded-md border border-tint/[0.08] bg-tint/[0.04] px-3 py-2.5">
                <span className="flex-1 truncate font-mono text-sm text-foreground">{value}</span>
                <button
                    type="button"
                    aria-label={t('Copier {x}', { x: t(label).toLowerCase() })}
                    onClick={() => {
                        void navigator.clipboard.writeText(value);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-tint/[0.06] hover:text-foreground"
                >
                    {copied ? <ShieldCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            </div>
        </div>
    );
}
