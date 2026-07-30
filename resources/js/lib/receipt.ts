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

function receiptHtml(sale: Sale): string {
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
<title>Ticket ${sale.id}</title>
<style>
@page {
    size: 58mm auto;
    margin: 0;
}
* {
    box-sizing: border-box;
}
html,
body {
    margin: 0;
    padding: 0;
    width: 58mm;
    background: #fff;
    color: #000;
}
body {
    font-family: "Courier New", monospace;
    font-size: 10px;
    line-height: 1.35;
}
.ticket {
    width: 58mm;
    padding: 3mm;
    page-break-after: always;
}
.ticket:last-child {
    page-break-after: auto;
}
.center {
    text-align: center;
}
.brand {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
}
.muted {
    font-size: 9px;
}
.line {
    border-top: 1px dashed #000;
    margin: 7px 0;
}
.row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
}
.label {
    overflow-wrap: anywhere;
}
.amount {
    flex: 0 0 auto;
    text-align: right;
    white-space: nowrap;
}
.item {
    margin: 5px 0;
}
.total {
    font-size: 12px;
    font-weight: 700;
}
@media print {
    html,
    body,
    .ticket {
        width: 58mm;
    }
}
</style>
</head>
<body>
${['Client', 'Employe']
    .map(
        (copyLabel) => `<main class="ticket">
    <section class="center">
        <div class="brand">BOGOSLAND</div>
        <div class="muted">Ticket ${copyLabel}</div>
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
        ${items
            .map(
                (item) => `
        <div class="item">
            <div class="row">
                <span class="label">${escapeHtml(item.label)} x${item.quantity}</span>
                <span class="amount">${escapeHtml(
                    formatCurrency(item.quantity * item.unit_price, {
                        maximumFractionDigits: 2,
                    }),
                )}</span>
            </div>
            <div class="muted">${escapeHtml(
                formatCurrency(item.unit_price, { maximumFractionDigits: 2 }),
            )} / unite</div>
        </div>`,
            )
            .join('')}
    </section>

    <div class="line"></div>

    <section class="row total">
        <span>Total</span>
        <span class="amount">${escapeHtml(formatCurrency(sale.total, { maximumFractionDigits: 2 }))}</span>
    </section>

    ${
        sale.commission_amount !== null && sale.commission_amount > 0
            ? `<section class="row muted">
        <span>Commission</span>
        <span class="amount">${escapeHtml(
            formatCurrency(sale.commission_amount, { maximumFractionDigits: 2 }),
        )}</span>
    </section>`
            : ''
    }

    <div class="line"></div>

    <section class="center muted">
        Merci pour votre visite
    </section>
</main>
`,
    )
    .join('')}
<script>
window.addEventListener('load', function () {
    window.focus();
    setTimeout(function () {
        window.print();
    }, 120);
});
</script>
</body>
</html>`;
}

export function printSaleReceipt(sale: Sale): void {
    const frame = document.createElement('iframe');
    frame.title = `Ticket ${sale.id}`;
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
    doc.write(receiptHtml(sale));
    doc.close();

    const removeFrame = () => {
        window.setTimeout(() => frame.remove(), 500);
    };

    frame.contentWindow?.addEventListener('afterprint', removeFrame, { once: true });
    window.setTimeout(removeFrame, 10_000);
}
