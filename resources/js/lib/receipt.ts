import type { Sale } from '@/types/workday';
import { formatCurrency, formatTime } from '@/lib/utils';
import { getCategoryLabel } from '@/components/workday/categories';

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

function receiptHtml(sale: Sale, copyLabel: string): string {
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

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Ticket ${sale.id} - ${escapeHtml(copyLabel)}</title>
<style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 58mm; background: #fff; color: #000; }
body { font-family: "Courier New", monospace; font-size: 10px; line-height: 1.35; }
.ticket { width: 58mm; padding: 3mm; }
.center { text-align: center; }
.brand { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.muted { font-size: 9px; }
.line { border-top: 1px dashed #000; margin: 7px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.label { overflow-wrap: anywhere; }
.amount { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.item { margin: 5px 0; }
.total { font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
<main class="ticket">
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
    <section class="center muted">Merci pour votre visite</section>
</main>
</body>
</html>`;
}

/** Prints arbitrary 58mm-ticket HTML through a hidden iframe (thermal-printer friendly). */
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

/** Prints the client copy first, then the employee copy two seconds later. */
export function printSaleReceipt(sale: Sale): void {
    printHtmlDocument(receiptHtml(sale, 'Client'), `Ticket ${sale.id} - Client`);
    window.setTimeout(
        () => printHtmlDocument(receiptHtml(sale, 'Employe'), `Ticket ${sale.id} - Employe`),
        2_000,
    );
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

function employeeSummaryHtml(summary: EmployeeDailySummary): string {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Total du jour - ${escapeHtml(summary.employeeName)}</title>
<style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 58mm; background: #fff; color: #000; }
body { font-family: "Courier New", monospace; font-size: 10px; line-height: 1.35; }
.ticket { width: 58mm; padding: 3mm; }
.center { text-align: center; }
.brand { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.muted { font-size: 9px; }
.line { border-top: 1px dashed #000; margin: 7px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.amount { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.total { font-size: 13px; font-weight: 700; }
.name { font-size: 12px; font-weight: 700; margin-top: 2px; }
</style>
</head>
<body>
<main class="ticket">
    <section class="center">
        <div class="brand">BOGOSLAND</div>
        <div class="muted">Total du jour</div>
        <div class="muted">${escapeHtml(formatSummaryDate(summary.date))}</div>
    </section>
    <div class="line"></div>
    <section class="center">
        <div class="name">${escapeHtml(summary.employeeName)}</div>
    </section>
    <div class="line"></div>
    <section class="row">
        <span>Tickets</span>
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
    )}</section>
</main>
</body>
</html>`;
}

/** Prints a single 58mm ticket summarizing one employee's day — for the employee to sign or keep. */
export function printEmployeeDailySummary(summary: EmployeeDailySummary): void {
    printHtmlDocument(employeeSummaryHtml(summary), `Total du jour - ${summary.employeeName}`);
}
