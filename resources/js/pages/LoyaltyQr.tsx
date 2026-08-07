import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { AlertCircle, Download, Loader2, Power, Printer, QrCode as QrCodeIcon, RefreshCw } from 'lucide-react';
import { getErrorMessage, getLoyaltyQr, regenerateLoyaltyQr, updateLoyaltySettings } from '@/lib/api';
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

/** Prints a self-contained A4 poster through a hidden iframe, same technique as resources/js/lib/receipt.ts. */
function printPoster(qrDataUrl: string, message: string): void {
    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rejoignez BOGOSLAND</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; background: #fff; color: #111; font-family: "Segoe UI", Arial, sans-serif; }
.poster { width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20mm; text-align: center; }
.brand { font-size: 34px; font-weight: 700; letter-spacing: 1px; margin-bottom: 6mm; }
.brand span { color: #b8873a; }
.message { font-size: 18px; max-width: 140mm; margin-bottom: 12mm; line-height: 1.4; }
.qr { border: 3px solid #111; padding: 8mm; border-radius: 8px; }
.qr img { width: 90mm; height: 90mm; display: block; }
.hint { margin-top: 10mm; font-size: 13px; color: #555; }
</style>
</head>
<body>
<div class="poster">
    <div class="brand">BOGOS<span>LAND</span></div>
    <div class="message">${message}</div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR inscription"></div>
    <div class="hint">Scannez avec l'appareil photo de votre téléphone</div>
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
        printPoster(qrImage, qrQuery.data.message ?? 'Scannez pour rejoindre les avantages BOGOSLAND');
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
                            Régénérer le lien invalide immédiatement toute affiche déjà imprimée — à utiliser
                            uniquement si le QR a été compromis ou perdu.
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
                description="Toute affiche déjà imprimée avec l'ancien QR cessera immédiatement de fonctionner."
                confirmLabel="Régénérer"
                variant="destructive"
                loading={regenerateMutation.isPending}
                onConfirm={() => regenerateMutation.mutate()}
            />
        </motion.div>
    );
}
