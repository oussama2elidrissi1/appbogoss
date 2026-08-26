import QRCode from 'qrcode';
import type { Sale } from '@/types/workday';
import { formatCurrency, formatTime } from '@/lib/utils';
import { getCategoryLabel } from '@/components/workday/categories';

export type TicketFormat = '58mm' | '80mm' | 'a4';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function clientName(sale: Sale): string {
    if (sale.client) return sale.client.name;
    if (sale.client_label) return sale.client_label;
    return 'Client de passage';
}

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

async function qrDataUrl(text: string): Promise<string | null> {
    try {
        return await QRCode.toDataURL(text, { margin: 0, width: 120 });
    } catch {
        return null;
    }
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
.qr { display: flex; justify-content: center; margin: 8px 0; }
.qr img { width: 90px; height: 90px; }
.duplicata { position: absolute; top: 6px; right: 6px; border: 2px solid #000; color: #000; font-weight: 700; font-size: 0.9em; padding: 1px 6px; transform: rotate(8deg); letter-spacing: 1px; }
</style>
</head>
<body>
<main class="ticket">
${bodyHtml}
</main>
</body>
</html>`;
}

interface ReceiptOptions {
    format?: TicketFormat;
    duplicata?: boolean;
}

async function receiptHtml(sale: Sale, copyLabel: string, options: ReceiptOptions = {}): Promise<string> {
    const format = options.format ?? '58mm';
    const date = new Date(sale.created_at);
    const dateLabel = Number.isNaN(date.getTime())
        ? sale.created_at
        : new Intl.DateTimeFormat('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          }).format(date);
    const items = sale.items.length > 0 ? sale.items : [
        {
            id: sale.id,
            label: getCategoryLabel(sale.category),
            quantity: 1,
            unit_price: sale.total,
        },
    ];
    const reference = `TICKET-${sale.id}`;
    const qr = await qrDataUrl(reference);

    const body = `
    ${options.duplicata ? '<div class="duplicata">DUPLICATA</div>' : ''}
    <section class="center">
        <div class="brand">BOGOSLAND</div>
        <div class="muted">Ticket ${escapeHtml(copyLabel)}</div>
        <div class="muted">No ${sale.id} - ${escapeHtml(dateLabel)}</div>
    </section>
    <div class="line"></div>
    <section>
        <div>Employe: ${escapeHtml(sale.employee.name)}</div>
        <div>Client: ${escapeHtml(clientName(sale))}</div>
        <div>Categorie: ${escapeHtml(getCategoryLabel(sale.category))}</div>
        <div>Paiement: ${escapeHtml(sale.payment_method)}</div>
        <div>Heure: ${escapeHtml(formatTime(sale.created_at))}</div>
    </section>
    <div class="line"></div>
    <section>
        ${items.map((item) => `
        <div class="item">
            <div class="row">
                <span class="label">${escapeHtml(item.label)} x${item.quantity}</span>
                <span class="amount">${escapeHtml(formatCurrency(item.quantity * item.unit_price, { maximumFractionDigits: 2 }))}</span>
            </div>
            <div class="muted">${escapeHtml(formatCurrency(item.unit_price, { maximumFractionDigits: 2 }))} / unite</div>
        </div>`).join('')}
    </section>
    <div class="line"></div>
    <section class="row total">
        <span>Total</span>
        <span class="amount">${escapeHtml(formatCurrency(sale.total, { maximumFractionDigits: 2 }))}</span>
    </section>
    ${sale.commission_amount !== null && sale.commission_amount > 0
        ? `<section class="row muted"><span>Commission</span><span class="amount">${escapeHtml(formatCurrency(sale.commission_amount, { maximumFractionDigits: 2 }))}</span></section>`
        : ''}
    <div class="line"></div>
    ${qr ? `<div class="qr"><img src="${qr}" alt="QR ${escapeHtml(reference)}"></div><section class="center muted">${escapeHtml(reference)}</section>` : ''}
    <section class="center muted">Merci pour votre visite</section>`;

    return documentShell(`Ticket ${sale.id} - ${copyLabel}`, format, body);
}

/** Prints arbitrary ticket HTML through a hidden iframe (thermal-printer and A4 friendly). */
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

/**
 * Prints the client copy first, then the employee copy two seconds later.
 * `duplicata: true` stamps both copies — used for reprints (print_count > 0).
 */
export async function printSaleReceipt(sale: Sale, options: ReceiptOptions = {}): Promise<void> {
    printHtmlDocument(await receiptHtml(sale, 'Client', options), `Ticket ${sale.id} - Client`);
    window.setTimeout(() => {
        void receiptHtml(sale, 'Employe', options).then((html) =>
            printHtmlDocument(html, `Ticket ${sale.id} - Employe`),
        );
    }, 2_000);
}

export interface EmployeeDailySummary {
    employeeName: string;
    /** 'YYYY-MM-DD' */
    date: string;
    salesCount: number;
    total: number;
    commissionTotal: number;
}

function formatSummaryDate(date: string): string {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(parsed);
}

function employeeSummaryHtml(summary: EmployeeDailySummary, format: TicketFormat): string {
    const body = `
    <section class="center">
        <div class="brand">BOGOSLAND</div>
        <div class="muted">Total du jour</div>
        <div class="muted">${escapeHtml(formatSummaryDate(summary.date))}</div>
    </section>
    <div class="line"></div>
    <section class="center">
        <div style="font-size: 1.2em; font-weight: 700; margin-top: 2px;">${escapeHtml(summary.employeeName)}</div>
    </section>
    <div class="line"></div>
    <section class="row">
        <span>Prestations</span>
        <span class="amount">${summary.salesCount}</span>
    </section>
    <section class="row total">
        <span>Chiffre d'affaires</span>
        <span class="amount">${escapeHtml(formatCurrency(summary.total, { maximumFractionDigits: 2 }))}</span>
    </section>
    ${summary.commissionTotal > 0
        ? `<section class="row muted"><span>Commission</span><span class="amount">${escapeHtml(formatCurrency(summary.commissionTotal, { maximumFractionDigits: 2 }))}</span></section>`
        : ''}
    <div class="line"></div>
    <section class="center muted">Genere le ${escapeHtml(
        new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()),
    )}</section>`;

    return documentShell(`Total du jour - ${summary.employeeName}`, format, body);
}

/** Prints a single ticket summarizing one employee's day — for the employee to sign or keep. */
export function printEmployeeDailySummary(summary: EmployeeDailySummary, format: TicketFormat = '58mm'): void {
    printHtmlDocument(employeeSummaryHtml(summary, format), `Total du jour - ${summary.employeeName}`);
}
