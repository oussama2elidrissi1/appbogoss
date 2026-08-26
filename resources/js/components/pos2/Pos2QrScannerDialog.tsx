import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import jsQR from 'jsqr';
import { AlertCircle, Camera, CameraOff, Loader2, ScanLine } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { pos2QrLookup } from '@/lib/pos2Api';
import type { Pos2QrLookupResult } from '@/types/pos2';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Pos2QrScannerDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called with the resolved client/subscription; the dialog closes itself. */
    onResolved: (result: Pos2QrLookupResult) => void;
}

/**
 * §20 — SCANNER QR at the caisse: camera + jsQR loop (same technique as
 * ScannerAbonnements), resolving both client-identity and subscription
 * tokens through /api/pos-v2/qr-lookup. Manual entry as fallback.
 */
export function Pos2QrScannerDialog({ open, onClose, onResolved }: Pos2QrScannerDialogProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const scanningRef = useRef(false);
    const [scanning, setScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState('');

    const stopCamera = useCallback(() => {
        scanningRef.current = false;
        setScanning(false);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const lookupMutation = useMutation({
        mutationFn: pos2QrLookup,
        onSuccess: (result) => {
            if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
            onResolved(result);
        },
    });

    const handleDetected = useCallback(
        (raw: string) => {
            const token = raw.trim();
            if (!token) return;
            if (navigator.vibrate) navigator.vibrate(60);
            stopCamera();
            lookupMutation.mutate(token);
        },
        [lookupMutation, stopCamera],
    );

    const startCamera = useCallback(async () => {
        setCameraError(null);
        lookupMutation.reset();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            setScanning(true);
            scanningRef.current = true;

            requestAnimationFrame(() => {
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = stream;
                void video.play();

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });

                const tick = () => {
                    if (!scanningRef.current) return;
                    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: 'dontInvert',
                        });
                        if (code?.data) {
                            handleDetected(code.data);
                            return;
                        }
                    }
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            });
        } catch {
            setCameraError(
                "Impossible d'accéder à la caméra. Autorisez-la dans le navigateur, ou saisissez le code manuellement.",
            );
        }
    }, [handleDetected, lookupMutation]);

    useEffect(() => {
        if (!open) {
            stopCamera();
            setManualToken('');
            setCameraError(null);
            lookupMutation.reset();
        }
        return stopCamera;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-display text-xl">
                        <ScanLine className="h-5 w-5 text-accent" />
                        Scanner un QR
                    </DialogTitle>
                </DialogHeader>

                {scanning ? (
                    <div className="space-y-3">
                        <div className="relative overflow-hidden rounded-md border border-accent/30 bg-black">
                            <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="h-40 w-40 rounded-md border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                            </div>
                            <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-medium text-white/80">
                                Placez le QR code dans le cadre
                            </div>
                        </div>
                        <Button type="button" variant="outline" className="w-full" onClick={stopCamera}>
                            <CameraOff />
                            Fermer la caméra
                        </Button>
                    </div>
                ) : (
                    <Button type="button" variant="accent" className="h-12 w-full" onClick={() => void startCamera()}>
                        <Camera />
                        Ouvrir la caméra
                    </Button>
                )}

                {cameraError && (
                    <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.10] px-3 py-2.5 text-xs text-destructive">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                        {cameraError}
                    </p>
                )}

                <div className="flex items-center gap-2">
                    <Input
                        value={manualToken}
                        onChange={(event) => setManualToken(event.target.value)}
                        onKeyDown={(event) =>
                            event.key === 'Enter' && manualToken.trim() && lookupMutation.mutate(manualToken.trim())
                        }
                        placeholder="…ou saisir le code manuellement"
                        className="h-10"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0"
                        disabled={!manualToken.trim() || lookupMutation.isPending}
                        onClick={() => lookupMutation.mutate(manualToken.trim())}
                    >
                        {lookupMutation.isPending ? <Loader2 className="animate-spin" /> : 'Rechercher'}
                    </Button>
                </div>

                {lookupMutation.isError && (
                    <p className="text-xs text-destructive">{getErrorMessage(lookupMutation.error, 'QR non reconnu.')}</p>
                )}
            </DialogContent>
        </Dialog>
    );
}
