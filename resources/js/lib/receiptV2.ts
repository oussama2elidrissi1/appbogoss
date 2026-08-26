import { formatCurrency } from '@/lib/utils';
import type { Pos2Invoice } from '@/types/pos2';

/**
 * Caisse V2 ticket — same hidden-iframe printing technique and thermal
 * formats as lib/receipt.ts (V1, untouched), but rendered from a V2 invoice:
 * per-line employees, remises, paiement mixte and pourboires all appear on
 * the ticket.
 */

export type TicketFormat = '58mm' | '80mm' | 'a4';

interface FormatSpec {
    pageSize: string;
    width: string;
    padding: string;
    baseFontSize: string;
    brandFontSize: string;
    totalFontSize: string;
}

const FORMAT_SPECS: Record<TicketFormat, FormatSpec> = {
    '58mm': { pageSize: '58mm auto', width: '58mm', padding: '3mm', baseFontSize: '10px', brandFontSize: '15px', totalFontSize: '12px' },
    '80mm': { pageSize: '80mm auto', width: '80mm', padding: '4mm', baseFontSize: '11px', brandFontSize: '17px', totalFontSize: '14px' },
    a4: { pageSize: 'A4', width: '190mm', padding: '14mm', baseFontSize: '13px', brandFontSize: '24px', totalFontSize: '18px' },
};

const METHOD_LABELS: Record<string, string> = {
    especes: 'Espèces',
    carte: 'Carte',
    virement: 'Virement',
    mixte: 'Mixte',
    autre: 'Autre',
    abonnement: 'Abonnement',
};

export function paymentMethodLabel(method: string | null | undefined): string {
    if (!method) return '—';
    return METHOD_LABELS[method] ?? method;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(value: number): string {
    return formatCurrency(value, { maximumFractionDigits: 2 });
}

function documentShell(title: string, format: TicketFormat, bodyHtml: string): string {
    const spec = FORMAT_SPECS[format];

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${spec.pageSize}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${spec.width}; background: #fff; color: #000; }
body { font-family: "Courier New", monospace; font-size: ${spec.baseFontSize}; line-height: 1.35; }
.ticket { width: ${spec.width}; padding: ${spec.padding}; position: relative; }
.center { text-align: center; }
.brand { font-size: ${spec.brandFontSize}; font-weight: 700; letter-spacing: 0.5px; }
.muted { font-size: 0.85em; }
.line { border-top: 1px dashed #000; margin: 7px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.label { overflow-wrap: anywhere; }
.amount { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.item { margin: 5px 0; }
.total { font-size: ${spec.totalFontSize}; font-weight: 700; }
.duplicata { position: absolute; top: 6px; right: 6px; border: 2px solid #000; color: #000; font-weight: 700; font-size: 0.9em; padding: 1px 6px; transform: rotate(8deg); letter-spacing: 1px; }
.strike { text-decoration: line-through; }
</style>
</head>
<body>
<main class="ticket">
${bodyHtml}
</main>
</body>
</html>`;
}

export interface InvoiceReceiptOptions {
    format?: TicketFormat;
    duplicata?: boolean;
    salonName?: string;
    footer?: string | null;
}

async function invoiceReceiptHtml(invoice: Pos2Invoice, options: InvoiceReceiptOptions = {}): Promise<string> {
    const format = options.format ?? '58mm';
    const salonName = options.salonName?.trim() || 'BOGOSLAND';
    const footer = options.footer?.trim() || 'Merci pour votre visite';
    const date = new Date(invoice.confirmed_at ?? invoice.created_at);
    const dateLabel = Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          }).format(date);

    const items = invoice.items ?? [];
    const tips = (invoice.tips ?? []).filter((tip) => !tip.voided);
    const lineDiscounts = items.reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );
    const invoiceDiscount = invoice.discount_amount ?? 0;

    const body = `
    ${options.duplicata ? '<div class="duplicata">DUPLICATA</div>' : ''}
    <section class="center">
        <div class="brand">${escapeHtml(salonName)}</div>
        <div class="muted">${escapeHtml(invoice.reference)}</div>
        ${dateLabel ? `<div class="muted">${escapeHtml(dateLabel)}</div>` : ''}
    </section>
    <div class="line"></div>
    <section>
        <div>Client: ${escapeHtml(invoice.client_name ?? 'Client de passage')}</div>
        ${invoice.payment_method ? `<div>Paiement: ${escapeHtml(paymentMethodLabel(invoice.payment_method))}</div>` : ''}
    </section>
    <div class="line"></div>
    <section>
        ${items
            .map((item) => {
                const discount = Math.min(item.discount_amount ?? 0, item.line_total);
                return `
        <div class="item">
            <div class="row">
                <span class="label">${escapeHtml(item.label)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</span>
                <span class="amount">${
                    item.is_free
                        ? '0'
                        : escapeHtml(money(item.line_total - discount))
                }</span>
            </div>
            ${item.employee_name ? `<div class="muted">${escapeHtml(item.employee_name)}${item.beneficiary_name ? ` — ${escapeHtml(item.beneficiary_name)}` : ''}</div>` : item.beneficiary_name ? `<div class="muted">${escapeHtml(item.beneficiary_name)}</div>` : ''}
            ${item.is_free && item.public_price ? `<div class="muted">Abonnement — <span class="strike">${escapeHtml(money(item.public_price))}</span></div>` : ''}
            ${discount > 0 ? `<div class="muted">Remise ligne: -${escapeHtml(money(discount))}</div>` : ''}
        </div>`;
            })
            .join('')}
    </section>
    <div class="line"></div>
    ${
        lineDiscounts > 0 || invoiceDiscount > 0
            ? `<section class="row muted"><span>Sous-total</span><span class="amount">${escapeHtml(money(invoice.subtotal))}</span></section>
    ${lineDiscounts > 0 ? `<section class="row muted"><span>Remises lignes</span><span class="amount">-${escapeHtml(money(lineDiscounts))}</span></section>` : ''}
    ${invoiceDiscount > 0 ? `<section class="row muted"><span>Remise</span><span class="amount">-${escapeHtml(money(invoiceDiscount))}</span></section>` : ''}`
            : ''
    }
    <section class="row total">
        <span>TOTAL</span>
        <span class="amount">${escapeHtml(money(invoice.total))}</span>
    </section>
    ${(invoice.payment_breakdown ?? [])
        .map(
            (row) =>
                `<section class="row muted"><span>${escapeHtml(paymentMethodLabel(row.method))}</span><span class="amount">${escapeHtml(money(row.amount))}</span></section>`,
        )
        .join('')}
    ${
        invoice.amount_received !== null && invoice.amount_received !== undefined
            ? `<section class="row muted"><span>Reçu</span><span class="amount">${escapeHtml(money(invoice.amount_received))}</span></section>
    <section class="row muted"><span>Rendu</span><span class="amount">${escapeHtml(money(invoice.change_given ?? 0))}</span></section>`
            : ''
    }
    ${
        tips.length > 0
            ? `<div class="line"></div>
    <section class="row muted"><span>Pourboires</span><span class="amount">${escapeHtml(money(tips.reduce((sum, tip) => sum + tip.amount, 0)))}</span></section>`
            : ''
    }
    <div class="line"></div>
    <section class="center muted">${escapeHtml(footer)}</section>`;

    return documentShell(`${invoice.reference}`, format, body);
}

function printHtmlDocument(html: string, title: string): void {
    const frame = document.createElement('iframe');
    frame.title = title;
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
    }, 120);
}

export async function printInvoiceReceipt(invoice: Pos2Invoice, options: InvoiceReceiptOptions = {}): Promise<void> {
    printHtmlDocument(await invoiceReceiptHtml(invoice, options), invoice.reference);
}

// ---------------------------------------------------------------------
// Facture A4 (V2.1 §15) — professional invoice built entirely from the
// existing salon settings (name, address, phone, email, logo) — nothing
// hardcoded. Same hidden-iframe printing pipeline as the 58 mm ticket.
// ---------------------------------------------------------------------

export interface InvoiceA4Settings {
    salon_name?: string;
    salon_phone?: string;
    salon_email?: string;
    salon_address?: string;
    receipt_footer?: string | null;
    logo_url?: string | null;
}

export async function printInvoiceA4(invoice: Pos2Invoice, settings: InvoiceA4Settings = {}): Promise<void> {
    const salonName = settings.salon_name?.trim() || 'BOGOSLAND';
    const footer = settings.receipt_footer?.trim() || 'Merci pour votre confiance';
    const date = new Date(invoice.confirmed_at ?? invoice.created_at);
    const dateLabel = Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
    const timeLabel = Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);

    const items = invoice.items ?? [];
    const tips = (invoice.tips ?? []).filter((tip) => !tip.voided);
    const tipsTotal = tips.reduce((sum, tip) => sum + tip.amount, 0);
    const lineDiscounts = items.reduce(
        (sum, item) => sum + Math.min(item.discount_amount ?? 0, item.line_total),
        0,
    );
    const invoiceDiscount = invoice.discount_amount ?? 0;

    const rows = items
        .map((item) => {
            const discount = Math.min(item.discount_amount ?? 0, item.line_total);
            const net = item.is_free ? 0 : item.line_total - discount;
            return `
        <tr>
            <td>
                <div class="svc">${escapeHtml(item.label)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</div>
                <div class="sub">${[
                    item.employee_name ? `Employé : ${escapeHtml(item.employee_name)}` : null,
                    item.beneficiary_name ? `Pour : ${escapeHtml(item.beneficiary_name)}` : null,
                    item.duration_minutes ? `${item.duration_minutes} min` : null,
                    item.is_free ? 'Couvert par abonnement' : null,
                    discount > 0 ? `Remise ligne : −${escapeHtml(money(discount))}` : null,
                ]
                    .filter(Boolean)
                    .join(' · ')}</div>
            </td>
            <td class="num">${item.is_free && item.public_price ? `<span class="strike">${escapeHtml(money(item.public_price))}</span> ` : ''}${escapeHtml(money(net))}</td>
        </tr>`;
        })
        .join('');

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(invoice.reference)}</title>
<style>
@page { size: A4; margin: 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #14202e; line-height: 1.5; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #C8A34C; padding-bottom: 14px; }
.brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
.coords { color: #5b6b7e; font-size: 11px; margin-top: 4px; white-space: pre-line; }
.logo { max-height: 64px; max-width: 160px; object-fit: contain; }
.docmeta { text-align: right; }
.docmeta .ref { font-size: 16px; font-weight: 700; }
.docmeta .muted { color: #5b6b7e; font-size: 11px; }
.client { margin: 16px 0 4px; }
.client strong { font-size: 13px; }
table { width: 100%; border-collapse: collapse; margin-top: 14px; }
th { text-align: left; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #5b6b7e; border-bottom: 1px solid #d8d4ca; padding: 6px 4px; }
th.num, td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td { padding: 9px 4px; border-bottom: 1px solid #eceae4; vertical-align: top; }
.svc { font-weight: 600; }
.sub { color: #5b6b7e; font-size: 10.5px; margin-top: 2px; }
.strike { text-decoration: line-through; color: #5b6b7e; }
.totals { margin-top: 12px; margin-left: auto; width: 62mm; }
.totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-variant-numeric: tabular-nums; }
.totals .muted { color: #5b6b7e; }
.totals .grand { border-top: 2px solid #C8A34C; margin-top: 6px; padding-top: 7px; font-size: 16px; font-weight: 700; }
.pay { margin-top: 4px; color: #5b6b7e; font-size: 11px; text-align: right; }
.tipnote { margin-top: 14px; padding: 8px 10px; background: #faf7ef; border: 1px solid #e2d8bd; border-radius: 4px; color: #5b6b7e; font-size: 11px; }
.foot { margin-top: 28px; border-top: 1px solid #eceae4; padding-top: 12px; }
.thanks { font-size: 13px; font-weight: 600; }
</style>
</head>
<body>
<div class="head">
    <div>
        ${settings.logo_url ? `<img class="logo" src="${escapeHtml(settings.logo_url)}" alt="">` : ''}
        <div class="brand">${escapeHtml(salonName)}</div>
        <div class="coords">${escapeHtml(
            [settings.salon_address, settings.salon_phone, settings.salon_email].filter(Boolean).join('\n'),
        )}</div>
    </div>
    <div class="docmeta">
        <div class="ref">FACTURE ${escapeHtml(invoice.reference)}</div>
        <div class="muted">${escapeHtml(dateLabel)}${timeLabel ? ` — ${escapeHtml(timeLabel)}` : ''}</div>
        ${invoice.status === 'refunded' ? '<div class="muted" style="color:#C32228;font-weight:700">REMBOURSÉE</div>' : ''}
    </div>
</div>

<div class="client">Client : <strong>${escapeHtml(invoice.client_name ?? 'Client de passage')}</strong>${
        invoice.client_phone ? ` — ${escapeHtml(invoice.client_phone)}` : ''
    }</div>

<table>
    <thead><tr><th>Prestation</th><th class="num">Montant</th></tr></thead>
    <tbody>${rows}</tbody>
</table>

<div class="totals">
    <div class="row muted"><span>Sous-total</span><span>${escapeHtml(money(invoice.subtotal))}</span></div>
    ${lineDiscounts > 0 ? `<div class="row muted"><span>Remises lignes</span><span>−${escapeHtml(money(lineDiscounts))}</span></div>` : ''}
    ${invoiceDiscount > 0 ? `<div class="row muted"><span>Remise</span><span>−${escapeHtml(money(invoiceDiscount))}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${escapeHtml(money(invoice.total))}</span></div>
</div>
<div class="pay">
    Paiement : ${escapeHtml(paymentMethodLabel(invoice.payment_method))}
    ${(invoice.payment_breakdown ?? [])
        .map((row) => `<br>${escapeHtml(paymentMethodLabel(row.method))} : ${escapeHtml(money(row.amount))}`)
        .join('')}
</div>

${
    tipsTotal > 0
        ? `<div class="tipnote">Pourboires remis directement aux employés : ${escapeHtml(money(tipsTotal))} (hors total facture).</div>`
        : ''
}

<div class="foot">
    <div class="thanks">${escapeHtml(footer)}</div>
</div>
</body>
</html>`;

    printHtmlDocument(html, `Facture ${invoice.reference}`);
}
