import QRCode from 'qrcode';

/**
 * L'AFFICHE PARTENAIRE BOGOSLAND — un gabarit fixe, un QR variable.
 *
 * L'affiche n'est PAS dessinée ici : c'est la maquette officielle, une image
 * déposée dans `public/img/`. Ce module ne fait qu'une chose — remplacer le
 * QR central par celui du partenaire. Ni le logo, ni les couleurs, ni les
 * textes, ni le cadre doré, ni la photo ne sont touchés : ils vivent dans le
 * fichier, pas dans le code.
 *
 * Affiche Hôtel A = affiche Hôtel B, au QR près. La contrainte est
 * structurelle, pas déclarative.
 *
 * COMMENT LE QR EST PLACÉ — en deux mesures faites sur le gabarit lui-même,
 * à chaque rendu, plutôt qu'en coordonnées codées en dur qui décaleraient
 * tout le jour où la maquette est ré-exportée :
 *
 *  1. `locateWhitePanel()` trouve le panneau blanc — les lignes de l'image
 *     portant une longue plage blanche continue. Le titre blanc de l'affiche
 *     est fait de lettres séparées et ne produit jamais d'aussi longue plage,
 *     c'est ce qui le distingue du panneau.
 *  2. `locateQrSquare()` mesure, DANS ce panneau, l'emprise des modules noirs
 *     du QR d'origine. Le nouveau QR reprend exactement cette emprise : même
 *     centre, même taille. C'est la différence entre « remplacer le QR » et
 *     « poser un QR par-dessus ».
 *
 * Mesures relevées sur la maquette officielle (1024 × 1536) : panneau blanc
 * x 293→731, y 538→934 ; QR x 330→692, y 562→912. Ces valeurs servent de
 * repli si une mesure échoue, jamais de chemin principal.
 *
 * IMPRESSION — le QR est régénéré à la résolution finale de l'export, pas
 * agrandi depuis l'image : ses modules restent nets au pixel près.
 */

/** Le gabarit, servi tel quel depuis `public/`. Même origine : pas de CORS. */
const TEMPLATE_URL = '/img/affiche-partenaire.png';

/**
 * Largeur d'export minimale : 2480 px, soit la largeur d'un A4 à 300 dpi.
 * Un gabarit plus défini est exporté à sa taille native, jamais réduit.
 */
const MIN_EXPORT_WIDTH = 2480;

/** Replis, en proportions de la maquette officielle. Secours uniquement. */
const FALLBACK_PANEL = { x: 0.2861, y: 0.3503, width: 0.4287, height: 0.2585 };
const FALLBACK_QR = { x: 0.3247, y: 0.3636, size: 0.3486 };

/** Marge de silence si l'emprise du QR d'origine n'a pas pu être mesurée. */
const FALLBACK_QUIET_ZONE = 0.085;

export class PosterTemplateMissing extends Error {
    constructor() {
        super(
            'L’affiche Bogos Land est introuvable. Déposez la maquette dans public/img/affiche-partenaire.png.',
        );
        this.name = 'PosterTemplateMissing';
    }
}

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Square {
    x: number;
    y: number;
    size: number;
}

function loadTemplate(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new PosterTemplateMissing());
        image.src = TEMPLATE_URL;
    });
}

/**
 * Le panneau blanc du QR : la boîte englobante des lignes qui portent une
 * plage blanche continue d'au moins un quart de la largeur de l'affiche.
 *
 * Le panneau de la maquette est plus large que haut (439 × 397) : on rend
 * donc le rectangle réel, sans le forcer au carré — c'est lui qu'on repeint,
 * et le QR carré viendra se placer dedans.
 */
function locateWhitePanel(data: Uint8ClampedArray, width: number, height: number): Rect | null {
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

    const w = right - left + 1;
    const h = bottom - top + 1;
    const ratio = w / h;

    // Un panneau crédible : à peu près carré, et d'une taille plausible sur
    // l'affiche. Sinon la mesure a attrapé autre chose et le repli vaut mieux.
    if (ratio < 0.8 || ratio > 1.35 || w < width * 0.2 || w > width * 0.75) return null;

    return { x: left, y: top, width: w, height: h };
}

/**
 * L'emprise du QR d'origine, mesurée à l'intérieur du panneau : boîte
 * englobante des modules noirs, ramenée au carré sur son propre centre.
 *
 * Le carré retenu prend la moyenne des deux côtés mesurés — un QR imprimé
 * peut être large d'un pixel de plus que haut selon l'anti-crénelage, et la
 * moyenne évite de rétrécir ou d'étirer inutilement.
 */
function locateQrSquare(
    data: Uint8ClampedArray,
    width: number,
    panel: Rect,
): Square | null {
    const isDark = (index: number) => data[index] < 110 && data[index + 1] < 110 && data[index + 2] < 110;

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = -1;
    let bottom = -1;

    const xEnd = panel.x + panel.width;
    const yEnd = panel.y + panel.height;

    for (let y = panel.y; y < yEnd; y++) {
        for (let x = panel.x; x < xEnd; x++) {
            if (isDark((y * width + x) * 4)) {
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
    }

    if (right < 0 || bottom < 0) return null;

    const w = right - left + 1;
    const h = bottom - top + 1;
    const ratio = w / h;

    // Le QR occupe la majeure partie du panneau et il est carré. Toute autre
    // forme signifie qu'on a mesuré autre chose que des modules.
    if (ratio < 0.9 || ratio > 1.15 || w < panel.width * 0.5) return null;

    const size = Math.round((w + h) / 2);
    const centerX = (left + right + 1) / 2;
    const centerY = (top + bottom + 1) / 2;

    // Le carré reste dans le panneau, avec au moins 2 % de marge blanche :
    // la zone de silence du QR ne doit jamais toucher le cadre doré.
    const margin = Math.round(Math.min(panel.width, panel.height) * 0.02);
    const maxSize = Math.min(panel.width, panel.height) - margin * 2;
    const finalSize = Math.min(size, maxSize);

    let x = Math.round(centerX - finalSize / 2);
    let y = Math.round(centerY - finalSize / 2);
    x = Math.max(panel.x + margin, Math.min(x, panel.x + panel.width - margin - finalSize));
    y = Math.max(panel.y + margin, Math.min(y, panel.y + panel.height - margin - finalSize));

    return { x, y, size: finalSize };
}

/**
 * Compose l'affiche : la maquette intacte, le QR du partenaire à la place
 * exacte du QR d'origine.
 *
 * @param url L'adresse encodée — l'URL publique du partenaire, /p/{token}.
 * @param exportWidth Largeur d'export. Par défaut le maximum entre la taille
 *                    native du gabarit et la largeur A4 à 300 dpi.
 */
export async function renderPartnerPoster(url: string, exportWidth?: number): Promise<string> {
    const template = await loadTemplate();

    const naturalWidth = template.naturalWidth;
    const naturalHeight = template.naturalHeight;

    // ---- mesures, à la définition native du gabarit ----------------------
    const probe = document.createElement('canvas');
    probe.width = naturalWidth;
    probe.height = naturalHeight;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    if (!probeCtx) throw new Error('Impossible de préparer l’affiche.');
    probeCtx.drawImage(template, 0, 0);

    let panel: Rect | null = null;
    let qr: Square | null = null;

    try {
        const pixels = probeCtx.getImageData(0, 0, naturalWidth, naturalHeight).data;
        panel = locateWhitePanel(pixels, naturalWidth, naturalHeight);
        if (panel !== null) {
            qr = locateQrSquare(pixels, naturalWidth, panel);
        }
    } catch {
        // Lecture de pixels refusée : on retombe sur les proportions relevées.
        panel = null;
        qr = null;
    }

    if (panel === null) {
        panel = {
            x: FALLBACK_PANEL.x * naturalWidth,
            y: FALLBACK_PANEL.y * naturalHeight,
            width: FALLBACK_PANEL.width * naturalWidth,
            height: FALLBACK_PANEL.height * naturalHeight,
        };
        qr = {
            x: FALLBACK_QR.x * naturalWidth,
            y: FALLBACK_QR.y * naturalHeight,
            size: FALLBACK_QR.size * naturalWidth,
        };
    }

    if (qr === null) {
        // Panneau trouvé mais QR non mesuré : carré centré dans le panneau.
        const side = Math.min(panel.width, panel.height) * (1 - FALLBACK_QUIET_ZONE * 2);
        qr = {
            x: panel.x + (panel.width - side) / 2,
            y: panel.y + (panel.height - side) / 2,
            size: side,
        };
    }

    // ---------------------------------------------------------- export ---
    // Une largeur explicite est honoree telle quelle — c'est l'appelant qui
    // sait ce qu'il veut (une vignette d'apercu n'a pas besoin des 2480 px).
    // Sans consigne, on ne descend jamais sous la definition du gabarit.
    const width = exportWidth ?? Math.max(MIN_EXPORT_WIDTH, naturalWidth);
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

    // ---- le panneau est repeint en blanc AVANT le QR ---------------------
    // L'ancien QR est ainsi effacé, pas recouvert, et la zone de silence est
    // garantie propre. Repeint 1 px à l'intérieur pour ne jamais déborder sur
    // le cadre doré, avec les coins arrondis de la maquette.
    const panelX = panel.x * scale + 1;
    const panelY = panel.y * scale + 1;
    const panelW = panel.width * scale - 2;
    const panelH = panel.height * scale - 2;
    const radius = Math.min(panelW, panelH) * 0.045;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(panelX + radius, panelY);
    ctx.arcTo(panelX + panelW, panelY, panelX + panelW, panelY + panelH, radius);
    ctx.arcTo(panelX + panelW, panelY + panelH, panelX, panelY + panelH, radius);
    ctx.arcTo(panelX, panelY + panelH, panelX, panelY, radius);
    ctx.arcTo(panelX, panelY, panelX + panelW, panelY, radius);
    ctx.closePath();
    ctx.fill();

    // ------------------------------------------------------------- QR ----
    const qrSize = Math.round(qr.size * scale);

    // Le QR est produit À la taille finale : aucun agrandissement, donc des
    // modules aux bords nets. `margin: 0` parce que la zone de silence est
    // déjà assurée par le panneau blanc.
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

    // Lissage coupé : un module doit rester un carré net, un bord interpolé
    // est ce qui fait échouer un scan à l'impression.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImage, Math.round(qr.x * scale), Math.round(qr.y * scale), qrSize, qrSize);

    // PNG : sans perte, donc aucune compression destructive sur les modules.
    return canvas.toDataURL('image/png');
}

/** Rendu allégé pour l'aperçu à l'écran — même gabarit, même composition. */
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
