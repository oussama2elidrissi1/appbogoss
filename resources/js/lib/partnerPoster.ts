import QRCode from 'qrcode';

/**
 * L'AFFICHE PARTENAIRE BOGOSLAND — une seule maquette, pour tout le monde.
 *
 * Le design est dessiné ici en dur, au canvas : noir, doré, la même
 * composition pour l'Hôtel A que pour la Salle C. Seul le QR change, parce
 * qu'il est le seul élément qui dépende du partenaire. C'est exactement la
 * contrainte demandée — une affiche identique, un QR différent.
 *
 * Pourquoi le canvas plutôt qu'un rendu serveur : l'application génère déjà
 * ses QR avec le paquet `qrcode` côté navigateur (tickets, fidélité,
 * abonnements). Une affiche PDF côté PHP imposerait une dépendance d'image
 * lourde pour un poster que l'on imprime une fois par partenaire.
 *
 * Le QR est dessiné en correction d'erreur haute et sur fond blanc franc,
 * avec une marge de silence : il reste scannable même imprimé en A4 modeste
 * ou photographié de travers.
 */

/** A4 à 150 dpi — assez pour une impression nette, assez léger pour le web. */
const WIDTH = 1240;
const HEIGHT = 1754;

const INK = '#0B0B0C';
const GOLD = '#C8A24C';
const PAPER = '#FFFFFF';

const SERVICES = [
    'Coupe Homme',
    'Barbe & soins',
    'Hammam Turc',
    'Soins visage',
    'Expérience Premium',
];

function roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function centeredText(
    ctx: CanvasRenderingContext2D,
    text: string,
    y: number,
    font: string,
    color: string,
    letterSpacing = 0,
): void {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    if (letterSpacing === 0) {
        ctx.fillText(text, WIDTH / 2, y);
        return;
    }

    // L'interlettrage n'existe pas dans l'API canvas : on le pose à la main,
    // sinon les titres de l'affiche perdent leur allure.
    const chars = [...text];
    const total = chars.reduce((sum, char) => sum + ctx.measureText(char).width + letterSpacing, 0) - letterSpacing;
    let cursor = (WIDTH - total) / 2;
    ctx.textAlign = 'left';
    chars.forEach((char) => {
        ctx.fillText(char, cursor, y);
        cursor += ctx.measureText(char).width + letterSpacing;
    });
    ctx.textAlign = 'center';
}

/**
 * Dessine l'affiche et renvoie un PNG en data URL.
 *
 * @param url L'adresse encodée dans le QR — celle du partenaire, et rien d'autre.
 */
export async function renderPartnerPoster(url: string): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de préparer l’affiche.');

    // -------------------------------------------------------------- fond
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Filet doré, une seule ligne fine : le liseré de l'identité.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    roundedRect(ctx, 48, 48, WIDTH - 96, HEIGHT - 96, 18);
    ctx.stroke();

    // ------------------------------------------------------------ en-tête
    centeredText(ctx, 'BOGOS LAND', 236, '700 104px Georgia, serif', PAPER, 6);
    centeredText(ctx, 'BARBERSHOP & HAMMAM TURC', 292, '600 30px Helvetica, Arial, sans-serif', GOLD, 7);

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 - 120, 336);
    ctx.lineTo(WIDTH / 2 + 120, 336);
    ctx.stroke();

    centeredText(ctx, 'DÉCOUVREZ BOGOS LAND', 434, '700 58px Georgia, serif', PAPER, 2);
    centeredText(ctx, 'SCANNEZ • RÉSERVEZ • PROFITEZ', 496, '600 30px Helvetica, Arial, sans-serif', GOLD, 5);

    // ----------------------------------------------------------------- QR
    // Fond blanc franc et marge de silence : les deux conditions d'un QR
    // qui se lit du premier coup.
    const qrBox = 620;
    const qrX = (WIDTH - qrBox) / 2;
    const qrY = 578;

    ctx.fillStyle = PAPER;
    roundedRect(ctx, qrX, qrY, qrBox, qrBox, 24);
    ctx.fill();

    const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 1024,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    const qrImage = new Image();
    await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => reject(new Error('QR illisible.'));
        qrImage.src = qrDataUrl;
    });

    const inner = qrBox - 56;
    ctx.drawImage(qrImage, qrX + 28, qrY + 28, inner, inner);

    // ------------------------------------------------------------- appel
    centeredText(ctx, 'SCANNEZ ICI', qrY + qrBox + 96, '700 50px Georgia, serif', GOLD, 4);
    centeredText(
        ctx,
        'POUR DÉCOUVRIR NOS SERVICES ET RÉSERVER',
        qrY + qrBox + 146,
        '500 26px Helvetica, Arial, sans-serif',
        PAPER,
        2,
    );

    // ---------------------------------------------------------- services
    let cursorY = qrY + qrBox + 232;
    ctx.textAlign = 'center';
    SERVICES.forEach((service) => {
        ctx.fillStyle = GOLD;
        ctx.font = '400 24px Helvetica, Arial, sans-serif';
        ctx.fillText('◆', WIDTH / 2 - 168, cursorY);

        ctx.fillStyle = PAPER;
        ctx.font = '500 28px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(service, WIDTH / 2 - 140, cursorY);
        ctx.textAlign = 'center';

        cursorY += 46;
    });

    return canvas.toDataURL('image/png');
}

/** Déclenche le téléchargement de l'affiche du partenaire. */
export async function downloadPartnerPoster(url: string, partnerName: string): Promise<void> {
    const dataUrl = await renderPartnerPoster(url);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `affiche-bogosland-${partnerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    link.click();
}

/** Télécharge le QR seul, pour une intégration dans un autre support. */
export async function downloadPartnerQr(url: string, partnerName: string): Promise<void> {
    const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 1024,
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-bogosland-${partnerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    link.click();
}
