import QRCode from 'qrcode';

/**
 * L'AFFICHE PARTENAIRE BOGOSLAND — un gabarit fixe, un QR variable.
 *
 * L'affiche n'est PAS dessinée ici : elle est une image, la maquette Bogos
 * Land validée, déposée une fois pour toutes dans `public/img/`. Ce module ne
 * fait qu'une chose — remplacer proprement la zone QR de cette image par le
 * QR du partenaire. Rien d'autre n'est touché : ni le logo, ni les couleurs,
 * ni les textes, ni le cadre doré, ni l'ambiance.
 *
 * Affiche Hôtel A = affiche Hôtel B, au QR près. C'est la contrainte, et elle
 * est structurelle : le fond est un fichier, pas du code.
 *
 * TROUVER LA ZONE QR — pourquoi une détection plutôt que des coordonnées en
 * dur : la maquette peut être re-exportée un jour dans une autre définition
 * ou un cadrage légèrement différent, et des pixels codés en dur décaleraient
 * alors le QR sans prévenir. `locateQrPanel()` retrouve le panneau blanc à
 * chaque rendu, en cherchant les lignes de l'image qui portent une longue
 * plage blanche continue — le panneau du QR est de loin la plus large surface
 * blanche de l'affiche. Les proportions mesurées sur la maquette de référence
 * restent en secours si la détection échoue.
 *
 * IMPRESSION — le QR est régénéré à la résolution finale de l'export, pas
 * agrandi depuis l'image : il reste net au pixel près quelle que soit la
 * définition du gabarit, et c'est lui qui doit être scannable.
 */

/** Le gabarit, servi tel quel depuis `public/`. Même origine : pas de CORS. */
const TEMPLATE_URL = '/img/affiche-partenaire.png';

/**
 * Largeur d'export minimale : 2480 px, soit la largeur d'un A4 à 300 dpi.
 * Un gabarit plus défini est exporté à sa taille native, jamais réduit.
 */
const MIN_EXPORT_WIDTH = 2480;

/**
 * Proportions du panneau blanc, mesurées sur la maquette de référence
 * (portrait 2:3). Secours uniquement — la détection passe avant.
 */
const FALLBACK_PANEL = { x: 0.291, y: 0.349, size: 0.425 };

/** Marge de silence autour du QR, en part du panneau. Sous 6 %, un scan rate. */
const QUIET_ZONE = 0.085;

export class PosterTemplateMissing extends Error {
    constructor() {
        super(
            'L’affiche Bogos Land est introuvable. Déposez la maquette dans public/img/affiche-partenaire.png.',
        );
        this.name = 'PosterTemplateMissing';
    }
}

function loadTemplate(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new PosterTemplateMissing());
        image.src = TEMPLATE_URL;
    });
}

interface Panel {
    x: number;
    y: number;
    size: number;
}

/**
 * Retrouve le panneau blanc du QR dans le gabarit.
 *
 * Méthode : pour chaque ligne de pixels, on mesure la plus longue plage
 * continue de blanc. Les lignes dont la plage dépasse le quart de la largeur
 * de l'affiche appartiennent au panneau — le texte blanc du titre, lui, est
 * fait de lettres séparées et ne produit jamais d'aussi longue plage. Le
 * panneau est la boîte englobante de ces lignes.
 *
 * On rend ensuite un CARRÉ : un QR est carré, et le panneau de la maquette
 * l'est à quelques pixels près.
 */
function locateQrPanel(data: Uint8ClampedArray, width: number, height: number): Panel | null {
    const minRun = Math.floor(width * 0.25);
    const isWhite = (index: number) => data[index] > 233 && data[index + 1] > 233 && data[index + 2] > 233;

    let top = -1;
    let bottom = -1;
    let left = width;
    let right = 0;

    for (let y = 0; y < height; y++) {
        let run = 0;
        let bestRun = 0;
        let bestEnd = 0;

        for (let x = 0; x < width; x++) {
            if (isWhite((y * width + x) * 4)) {
                run++;
                if (run > bestRun) {
                    bestRun = run;
                    bestEnd = x;
                }
            } else {
                run = 0;
            }
        }

        if (bestRun < minRun) continue;

        if (top === -1) top = y;
        bottom = y;
        left = Math.min(left, bestEnd - bestRun + 1);
        right = Math.max(right, bestEnd);
    }

    if (top === -1 || right <= left || bottom <= top) return null;

    // Le panneau doit ressembler à un carré et occuper une part crédible de
    // l'affiche : sinon c'est que la détection a attrapé autre chose, et on
    // préfère les proportions de référence à un QR posé n'importe où.
    const w = right - left + 1;
    const h = bottom - top + 1;
    const ratio = w / h;

    if (ratio < 0.8 || ratio > 1.25 || w < width * 0.2 || w > width * 0.75) return null;

    const size = Math.min(w, h);

    return {
        x: left + (w - size) / 2,
        y: top + (h - size) / 2,
        size,
    };
}

/**
 * Compose l'affiche : le gabarit intact, le QR du partenaire à la place du
 * QR d'origine.
 *
 * @param url L'adresse encodée — l'URL publique du partenaire, /p/{token}.
 * @param exportWidth Largeur d'export. Par défaut le maximum entre la taille
 *                    native du gabarit et la largeur A4 à 300 dpi.
 */
export async function renderPartnerPoster(url: string, exportWidth?: number): Promise<string> {
    const template = await loadTemplate();

    const naturalWidth = template.naturalWidth;
    const naturalHeight = template.naturalHeight;

    // ---- repérage de la zone QR, à la définition native du gabarit -------
    const probe = document.createElement('canvas');
    probe.width = naturalWidth;
    probe.height = naturalHeight;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    if (!probeCtx) throw new Error('Impossible de préparer l’affiche.');
    probeCtx.drawImage(template, 0, 0);

    let panel: Panel | null = null;
    try {
        const pixels = probeCtx.getImageData(0, 0, naturalWidth, naturalHeight).data;
        panel = locateQrPanel(pixels, naturalWidth, naturalHeight);
    } catch {
        // Lecture de pixels refusée : on retombe sur les proportions.
        panel = null;
    }

    if (panel === null) {
        panel = {
            x: FALLBACK_PANEL.x * naturalWidth,
            y: FALLBACK_PANEL.y * naturalHeight,
            size: FALLBACK_PANEL.size * naturalWidth,
        };
    }

    // ---------------------------------------------------------- export ---
    const width = Math.max(exportWidth ?? MIN_EXPORT_WIDTH, naturalWidth);
    const scale = width / naturalWidth;
    const height = Math.round(naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de préparer l’affiche.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(template, 0, 0, width, height);

    // ------------------------------------------------------------- QR ----
    const panelX = panel.x * scale;
    const panelY = panel.y * scale;
    const panelSize = panel.size * scale;

    // Le panneau est repeint en blanc franc avant le QR : l'ancien QR est
    // ainsi effacé, pas recouvert, et la zone de silence est garantie propre.
    // Coins légèrement arrondis pour épouser le panneau de la maquette et ne
    // pas déborder sur le cadre doré.
    const radius = panelSize * 0.045;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(panelX + radius, panelY);
    ctx.arcTo(panelX + panelSize, panelY, panelX + panelSize, panelY + panelSize, radius);
    ctx.arcTo(panelX + panelSize, panelY + panelSize, panelX, panelY + panelSize, radius);
    ctx.arcTo(panelX, panelY + panelSize, panelX, panelY, radius);
    ctx.arcTo(panelX, panelY, panelX + panelSize, panelY, radius);
    ctx.closePath();
    ctx.fill();

    const inset = panelSize * QUIET_ZONE;
    const qrSize = Math.round(panelSize - inset * 2);

    // Le QR est produit À la taille finale : aucun agrandissement, donc des
    // modules aux bords nets. `margin: 0` parce que la zone de silence est
    // déjà assurée par l'encart blanc ci-dessus.
    const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        margin: 0,
        width: qrSize,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    const qrImage = new Image();
    await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => reject(new Error('QR illisible.'));
        qrImage.src = qrDataUrl;
    });

    // Lissage coupé pour le QR : un module doit rester un carré net, un bord
    // interpolé est ce qui fait échouer un scan à l'impression.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImage, Math.round(panelX + inset), Math.round(panelY + inset), qrSize, qrSize);

    // PNG : sans perte, donc aucune compression destructive sur les modules.
    return canvas.toDataURL('image/png');
}

/** Rendu allégé pour l'aperçu à l'écran — même composition, même gabarit. */
export function renderPartnerPosterPreview(url: string): Promise<string> {
    return renderPartnerPoster(url, 860);
}

function triggerDownload(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'partenaire';
}

/** Télécharge l'affiche Bogos Land portant le QR de ce partenaire. */
export async function downloadPartnerPoster(url: string, partnerName: string): Promise<void> {
    triggerDownload(await renderPartnerPoster(url), `affiche-bogosland-${slug(partnerName)}.png`);
}

/** Télécharge le QR seul, pour un autre support que l'affiche. */
export async function downloadPartnerQr(url: string, partnerName: string): Promise<void> {
    const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 1600,
    });
    triggerDownload(dataUrl, `qr-bogosland-${slug(partnerName)}.png`);
}
