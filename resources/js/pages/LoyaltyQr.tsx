import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { AlertCircle, Download, Loader2, MonitorPlay, Power, Printer, QrCode as QrCodeIcon, RefreshCw } from 'lucide-react';
import { getErrorMessage, getLoyaltyQr, regenerateLoyaltyQr, updateLoyaltySettings } from '@/lib/api';
import type { LoyaltyQrPosterLanguage } from '@/types/loyalty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const } },
};

function joinUrl(token: string): string {
    return `${window.location.origin}/join?t=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const POSTER_CAPTIONS: Record<'fr' | 'ar', { eyebrow: string; hint: string; footer: string }> = {
    fr: {
        eyebrow: 'Programme de fidélité',
        hint: 'Scannez avec l’appareil photo de votre téléphone',
        footer: 'Merci de votre confiance',
    },
    ar: {
        eyebrow: 'برنامج الولاء',
        hint: 'امسحوا الرمز بكاميرا هاتفكم',
        footer: 'شكراً لثقتكم',
    },
};

/**
 * Prints a self-contained A4 poster through a hidden iframe, same technique
 * as resources/js/lib/receipt.ts. `language` picks which fixed captions
 * (eyebrow/hint/footer) render — 'both' stacks fr above ar, each in its own
 * text direction. The custom message itself is free text set by the admin
 * (Fidélité → Paramètres) and rendered as-is, only HTML-escaped.
 */
function printPoster(qrDataUrl: string, message: string, language: LoyaltyQrPosterLanguage): void {
    const langs: Array<'fr' | 'ar'> = language === 'both' ? ['fr', 'ar'] : [language];
    const safeMessage = escapeHtml(message);

    const captionBlocks = langs
        .map(
            (lang) => `
        <p class="eyebrow" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">${escapeHtml(POSTER_CAPTIONS[lang].eyebrow)}</p>`,
        )
        .join('');

    const hintBlocks = langs
        .map(
            (lang) => `
        <p class="hint" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">${escapeHtml(POSTER_CAPTIONS[lang].hint)}</p>`,
        )
        .join('');

    const footerBlocks = langs
        .map(
            (lang) => `<span dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">${escapeHtml(POSTER_CAPTIONS[lang].footer)}</span>`,
        )
        .join('<span class="footer-sep">·</span>');

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rejoignez BOGOSLAND</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body {
    margin: 0; padding: 0; width: 210mm; height: 297mm;
    background: #f9f8f5; color: #0e1d2f;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
}
.page { width: 210mm; height: 297mm; padding: 14mm; }
.frame-outer {
    height: 100%; border: 1.5pt solid #b8873a; border-radius: 3mm;
    padding: 3mm; position: relative;
}
.frame-inner {
    height: 100%; border: 0.6pt solid #0e1d2f22; border-radius: 2mm;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: 14mm 16mm; text-align: center; position: relative;
}
.corner {
    position: absolute; width: 7mm; height: 7mm; border-color: #b8873a; border-style: solid; border-width: 0;
}
.corner-tl { top: -1.5pt; left: -1.5pt; border-top-width: 1.5pt; border-left-width: 1.5pt; border-top-left-radius: 2mm; }
.corner-tr { top: -1.5pt; right: -1.5pt; border-top-width: 1.5pt; border-right-width: 1.5pt; border-top-right-radius: 2mm; }
.corner-bl { bottom: -1.5pt; left: -1.5pt; border-bottom-width: 1.5pt; border-left-width: 1.5pt; border-bottom-left-radius: 2mm; }
.corner-br { bottom: -1.5pt; right: -1.5pt; border-bottom-width: 1.5pt; border-right-width: 1.5pt; border-bottom-right-radius: 2mm; }
.top-block { display: flex; flex-direction: column; align-items: center; }
.brand { font-size: 40px; font-weight: 700; letter-spacing: 2px; }
.brand .gold { color: #b8873a; }
.rule { width: 26mm; height: 1pt; background: #b8873a; margin: 5mm 0 4mm; }
.eyebrow { margin: 0; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #6b5a35; }
.message-card {
    margin: 10mm 0; padding: 7mm 10mm; max-width: 150mm;
    background: #ffffff; border: 0.6pt solid #b8873a55; border-radius: 3mm;
}
.message { margin: 0; font-size: 19px; font-style: italic; line-height: 1.55; color: #0e1d2f; }
.qr-block { display: flex; flex-direction: column; align-items: center; }
.qr-frame { position: relative; padding: 9mm; background: #ffffff; border: 0.75pt solid #0e1d2f18; border-radius: 4mm; box-shadow: 0 2mm 6mm rgba(14,29,47,0.08); }
.qr-frame img { width: 78mm; height: 78mm; display: block; }
.qr-corner { position: absolute; width: 6mm; height: 6mm; border-color: #b8873a; border-style: solid; border-width: 0; }
.qr-corner.tl { top: 2mm; left: 2mm; border-top-width: 1.2pt; border-left-width: 1.2pt; }
.qr-corner.tr { top: 2mm; right: 2mm; border-top-width: 1.2pt; border-right-width: 1.2pt; }
.qr-corner.bl { bottom: 2mm; left: 2mm; border-bottom-width: 1.2pt; border-left-width: 1.2pt; }
.qr-corner.br { bottom: 2mm; right: 2mm; border-bottom-width: 1.2pt; border-right-width: 1.2pt; }
.hint { margin: 5mm 0 0; font-size: 13px; color: #52606d; }
.bottom-block { display: flex; flex-direction: column; align-items: center; }
.footer-rule { width: 40mm; height: 0.6pt; background: #0e1d2f22; margin-bottom: 4mm; }
.footer-text { font-size: 11px; letter-spacing: 1px; color: #8a7a52; }
.footer-sep { margin: 0 6px; }
</style>
</head>
<body>
<div class="page">
    <div class="frame-outer">
        <div class="frame-inner">
            <span class="corner corner-tl"></span>
            <span class="corner corner-tr"></span>
            <span class="corner corner-bl"></span>
            <span class="corner corner-br"></span>

            <div class="top-block">
                <div class="brand">BOGOS<span class="gold">LAND</span></div>
                <div class="rule"></div>
                ${captionBlocks}
            </div>

            <div class="message-card"><p class="message">${safeMessage}</p></div>

            <div class="qr-block">
                <div class="qr-frame">
                    <span class="qr-corner tl"></span>
                    <span class="qr-corner tr"></span>
                    <span class="qr-corner bl"></span>
                    <span class="qr-corner br"></span>
                    <img src="${qrDataUrl}" alt="QR inscription">
                </div>
                ${hintBlocks}
            </div>

            <div class="bottom-block">
                <div class="footer-rule"></div>
                <div class="footer-text">${footerBlocks}</div>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!doc) {
        frame.remove();
        return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const removeFrame = () => window.setTimeout(() => frame.remove(), 500);
    frame.contentWindow?.addEventListener('afterprint', removeFrame, { once: true });
    window.setTimeout(removeFrame, 10_000);
    window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
    }, 150);
}

export default function LoyaltyQr() {
    const queryClient = useQueryClient();
    const [qrImage, setQrImage] = useState<string | null>(null);
    const [regenerateOpen, setRegenerateOpen] = useState(false);
    // Sticky post-regeneration reminder: the old printed posters are dead,
    // staff must reprint and swap every QR displayed in the salon.
    const [justRegenerated, setJustRegenerated] = useState(false);

    const qrQuery = useQuery({ queryKey: ['loyalty-qr'], queryFn: getLoyaltyQr });

    useEffect(() => {
        if (!qrQuery.data?.token) {
            setQrImage(null);
            return;
        }
        let cancelled = false;
        QRCode.toDataURL(joinUrl(qrQuery.data.token), { margin: 1, width: 480 })
            .then((url) => {
                if (!cancelled) setQrImage(url);
            })
            .catch(() => {
                if (!cancelled) setQrImage(null);
            });
        return () => {
            cancelled = true;
        };
    }, [qrQuery.data?.token]);

    const regenerateMutation = useMutation({
        mutationFn: regenerateLoyaltyQr,
        onSuccess: () => {
            setRegenerateOpen(false);
            setJustRegenerated(true);
            void queryClient.invalidateQueries({ queryKey: ['loyalty-qr'] });
        },
    });

    const toggleMutation = useMutation({
        mutationFn: (enabled: boolean) => updateLoyaltySettings({ loyalty_qr_registration_enabled: enabled }),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['loyalty-qr'] }),
    });

    const handleDownload = () => {
        if (!qrImage) return;
        const link = document.createElement('a');
        link.href = qrImage;
        link.download = 'bogosland-qr-inscription.png';
        link.click();
    };

    const handlePrint = () => {
        if (!qrImage || !qrQuery.data) return;
        printPoster(
            qrImage,
            qrQuery.data.message ?? 'Scannez pour rejoindre les avantages BOGOSLAND',
            qrQuery.data.poster_language ?? 'fr',
        );
    };

    if (qrQuery.isError) {
        return (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.10] px-4 py-3">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{getErrorMessage(qrQuery.error)}</p>
            </div>
        );
    }

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">QR Code d’inscription</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        À afficher ou imprimer au salon — les clients scannent pour rejoindre le programme de fidélité.
                    </p>
                </div>
                {qrQuery.data && (
                    <Badge variant={qrQuery.data.enabled ? 'success' : 'outline'}>
                        {qrQuery.data.enabled ? 'Inscriptions ouvertes' : 'Inscriptions fermées'}
                    </Badge>
                )}
            </motion.div>

            {justRegenerated && (
                <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-md border border-accent/40 bg-accent/[0.10] px-4 py-3.5 sm:flex-row sm:items-center"
                >
                    <AlertCircle className="h-5 w-5 shrink-0 text-accent" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            Nouveau QR Code généré — les anciens ne fonctionnent plus.
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Réimprimez la nouvelle affiche et remplacez tous les QR affichés au salon
                            (comptoir, vitrine, cabines…).
                        </p>
                    </div>
                    <Button type="button" variant="accent" onClick={handlePrint} disabled={!qrImage}>
                        <Printer />
                        Imprimer la nouvelle affiche
                    </Button>
                </div>
            )}

            <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
                <Card className="flex flex-col items-center gap-5 p-6">
                    {qrQuery.isPending || !qrImage ? (
                        <Skeleton className="h-[240px] w-[240px] rounded-md" />
                    ) : (
                        <img
                            src={qrImage}
                            alt="QR Code d'inscription BOGOSLAND"
                            className="h-[240px] w-[240px] rounded-md border border-tint/[0.08] bg-white p-3"
                        />
                    )}

                    <div className="flex w-full flex-col gap-2">
                        <Button type="button" variant="outline" onClick={handleDownload} disabled={!qrImage}>
                            <Download />
                            Télécharger en PNG
                        </Button>
                        <Button type="button" variant="outline" onClick={handlePrint} disabled={!qrImage}>
                            <Printer />
                            Imprimer l’affiche
                        </Button>
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => window.open('/loyalty-qr/affichage', '_blank')}
                        >
                            <MonitorPlay />
                            Afficher à l’écran (animé)
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setRegenerateOpen(true)}
                            disabled={regenerateMutation.isPending}
                        >
                            <RefreshCw />
                            Régénérer le lien
                        </Button>
                    </div>
                </Card>

                <div className="space-y-4">
                    <Card className="p-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <QrCodeIcon className="h-4 w-4 text-accent" />
                            Lien d’inscription
                        </h3>
                        <p className="mt-2 break-all rounded-md bg-tint/[0.03] px-3 py-2 font-mono text-xs text-muted-foreground">
                            {qrQuery.data ? joinUrl(qrQuery.data.token) : '…'}
                        </p>
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Ce QR est permanent</span> — il ne
                            change jamais tout seul. Il n’est invalidé que si vous cliquez « Régénérer le
                            lien », auquel cas toutes les affiches imprimées devront être remplacées — à
                            réserver au cas où le QR aurait été compromis ou perdu.
                        </p>
                    </Card>

                    <Card className="p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Inscriptions publiques</h3>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    Désactivez temporairement le scan sans supprimer le lien (ex. maintenance).
                                </p>
                            </div>
                            <Button
                                type="button"
                                size="icon"
                                variant={qrQuery.data?.enabled ? 'accent' : 'outline'}
                                aria-label={qrQuery.data?.enabled ? 'Désactiver les inscriptions' : 'Activer les inscriptions'}
                                disabled={toggleMutation.isPending || !qrQuery.data}
                                onClick={() => qrQuery.data && toggleMutation.mutate(!qrQuery.data.enabled)}
                            >
                                {toggleMutation.isPending ? <Loader2 className="animate-spin" /> : <Power />}
                            </Button>
                        </div>
                    </Card>
                </div>
            </motion.div>

            <ConfirmDialog
                open={regenerateOpen}
                onOpenChange={setRegenerateOpen}
                title="Régénérer le QR Code ?"
                description="Attention : si vous régénérez, tous les QR déjà imprimés cesseront immédiatement de fonctionner. Vous devrez réimprimer la nouvelle affiche et remplacer chaque QR affiché dans le salon (comptoir, vitrine, cabines…). Le QR actuel, lui, ne change jamais tant que vous ne le régénérez pas."
                confirmLabel="Je comprends, régénérer"
                variant="destructive"
                loading={regenerateMutation.isPending}
                onConfirm={() => regenerateMutation.mutate()}
            />
        </motion.div>
    );
}
