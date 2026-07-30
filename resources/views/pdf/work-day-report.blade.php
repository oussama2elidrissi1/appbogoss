<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Rapport caisse - {{ $day->date->toDateString() }}</title>
    <style>
        @page { margin: 26px 28px 34px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 9px; color: #1d2939; }
        h1 { color: #132238; font-size: 19px; margin: 0; }
        h2 { color: #132238; font-size: 12px; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #c8a24c; }
        h3 { color: #43546b; font-size: 10px; margin: 12px 0 5px; }
        p { margin: 4px 0; line-height: 1.45; }
        .header { border-bottom: 1px solid #d6dde7; padding-bottom: 12px; }
        .brand { color: #c8a24c; font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
        .meta { color: #53657b; margin-top: 5px; }
        .grid { width: 100%; border-collapse: separate; border-spacing: 5px; margin: 5px -5px 0; }
        .metric { background: #f2f5f8; border: 1px solid #d9e0e8; padding: 7px; width: 20%; }
        .metric .label { color: #63758a; font-size: 7px; font-weight: bold; text-transform: uppercase; }
        .metric .value { color: #132238; font-size: 12px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        th, td { border-bottom: 1px solid #e0e5eb; padding: 5px 6px; vertical-align: top; }
        th { background: #edf1f5; color: #43546b; font-size: 8px; text-align: left; text-transform: uppercase; }
        .text-right { text-align: right; }
        .muted { color: #63758a; }
        .two { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px; }
        .two > tbody > tr > td { border: 0; padding: 0 12px 0 0; width: 50%; vertical-align: top; }
        .page-break { page-break-before: always; }
        .deleted { color: #a33a42; text-decoration: line-through; }
        .status { color: #a33a42; font-weight: bold; }
    </style>
</head>
<body>
@php($report = $report ?? [])
<div class="header">
    <div class="brand">Bogosland Manager</div>
    <h1>Rapport complet de journee</h1>
    <p class="meta">
        Date : <strong>{{ $day->date->toDateString() }}</strong>
        &nbsp; | &nbsp; Statut : <strong>{{ $day->status === 'closed' ? 'Cloturee' : 'Ouverte' }}</strong>
        &nbsp; | &nbsp; Ouverte par : {{ $day->openedBy->name ?? 'N/A' }}
    </p>
</div>

<table class="grid">
    <tr>
        @foreach ([
            ['CA', $report['revenue_total'] ?? 0],
            ['Depenses', $report['expenses_total'] ?? 0],
            ['Avances', $report['advances_total'] ?? 0],
            ['Commissions', $report['commissions_total'] ?? 0],
            ['Resultat net', $report['net_result'] ?? 0],
        ] as $metric)
            <td class="metric"><div class="label">{{ $metric[0] }}</div><div class="value">{{ number_format($metric[1], 2, ',', ' ') }} MAD</div></td>
        @endforeach
    </tr>
</table>

<table class="summary">
    <tr>
        <td>Fonds de caisse : <strong>{{ number_format($report['opening_balance'] ?? $day->opening_balance, 2, ',', ' ') }} MAD</strong></td>
        <td>Cash attendu : <strong>{{ number_format($report['cash_expected'] ?? 0, 2, ',', ' ') }} MAD</strong></td>
        <td>Tickets actifs : <strong>{{ $report['ticket_count'] ?? 0 }}</strong></td>
        <td>Tickets supprimes : <strong>{{ $report['deleted_ticket_count'] ?? 0 }}</strong></td>
        <td>Tickets imprimes : <strong>{{ $report['printed_ticket_count'] ?? 0 }}</strong></td>
    </tr>
</table>

<h2>Activite commerciale</h2>
<table>
    <thead><tr><th>Categorie</th><th class="text-right">Tickets</th><th class="text-right">Total</th></tr></thead>
    <tbody>
    @forelse ($report['revenue_by_category'] ?? [] as $row)
        <tr><td>{{ $row['category'] ?? 'Autre' }}</td><td class="text-right">{{ $row['count'] ?? 0 }}</td><td class="text-right">{{ number_format($row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
    @empty
        <tr><td colspan="3" class="muted">Aucune vente active.</td></tr>
    @endforelse
    </tbody>
</table>

<table class="two">
    <tr>
        <td>
            <h3>Par employe et prestation</h3>
            <table>
                <thead><tr><th>Employe</th><th>Prestations</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                @forelse (($report['employee_by_prestation'] ?? $report['revenue_by_employee'] ?? []) as $row)
                    <tr>
                        <td>{{ $row['employee_name'] ?? 'Employe' }}<br><span class="muted">{{ $row['count'] ?? 0 }} ticket(s)</span></td>
                        <td>{{ collect($row['prestations'] ?? [])->map(fn ($item) => ($item['label'] ?? 'Prestation').' ('.($item['count'] ?? 0).')')->implode(', ') ?: '-' }}</td>
                        <td class="text-right">{{ number_format($row['total'] ?? 0, 2, ',', ' ') }} MAD</td>
                    </tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune donnee.</td></tr>
                @endforelse
                </tbody>
            </table>
        </td>
        <td>
            <h3>Prestations par employe</h3>
            <table>
                <thead><tr><th>Prestation</th><th>Employes</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                @forelse ($report['prestation_by_employee'] ?? [] as $row)
                    <tr>
                        <td>{{ $row['label'] ?? 'Prestation' }}<br><span class="muted">{{ $row['count'] ?? 0 }} passage(s)</span></td>
                        <td>{{ collect($row['employees'] ?? [])->map(fn ($item) => ($item['employee_name'] ?? 'Employe').' ('.($item['count'] ?? 0).')')->implode(', ') ?: '-' }}</td>
                        <td class="text-right">{{ number_format($row['total'] ?? 0, 2, ',', ' ') }} MAD</td>
                    </tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune prestation.</td></tr>
                @endforelse
                </tbody>
            </table>
        </td>
    </tr>
</table>

<h2>Depenses et avances</h2>
<table class="two">
    <tr>
        <td>
            <h3>Depenses par categorie</h3>
            <table>
                <thead><tr><th>Categorie</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                @forelse ($report['expenses_by_category'] ?? [] as $row)
                    <tr><td>{{ $row['category'] ?? 'General' }}</td><td class="text-right">{{ $row['count'] ?? 0 }}</td><td class="text-right">{{ number_format($row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune depense.</td></tr>
                @endforelse
                </tbody>
            </table>
            <h3>Detail des depenses</h3>
            <table>
                <thead><tr><th>Date</th><th>Libelle</th><th class="text-right">Montant</th></tr></thead>
                <tbody>
                @forelse ($report['expense_details'] ?? [] as $row)
                    <tr><td>{{ $row['spent_on'] ?? '-' }}</td><td>{{ $row['label'] ?? '-' }}</td><td class="text-right">{{ number_format($row['amount'] ?? $row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune depense.</td></tr>
                @endforelse
                </tbody>
            </table>
        </td>
        <td>
            <h3>Avances par employe</h3>
            <table>
                <thead><tr><th>Employe</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                @forelse ($report['advances_by_employee'] ?? [] as $row)
                    <tr><td>{{ $row['employee_name'] ?? 'Employe' }}</td><td class="text-right">{{ $row['count'] ?? 0 }}</td><td class="text-right">{{ number_format($row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune avance.</td></tr>
                @endforelse
                </tbody>
            </table>
            <h3>Detail des avances</h3>
            <table>
                <thead><tr><th>Date</th><th>Employe / Motif</th><th class="text-right">Montant</th></tr></thead>
                <tbody>
                @forelse ($report['advance_details'] ?? [] as $row)
                    <tr><td>{{ $row['given_on'] ?? '-' }}</td><td>{{ $row['employee_name'] ?? 'Employe' }}<br><span class="muted">{{ $row['reason'] ?: 'Sans motif' }} - {{ $row['settled_at'] ? 'Reglee' : 'Non reglee' }}</span></td><td class="text-right">{{ number_format($row['amount'] ?? $row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="3" class="muted">Aucune avance.</td></tr>
                @endforelse
                </tbody>
            </table>
        </td>
    </tr>
</table>

<h2>Tickets de la journee</h2>
<table>
    <thead><tr><th>No</th><th>Heure</th><th>Employe</th><th>Client</th><th>Prestation</th><th>Statut</th><th class="text-right">Total</th><th class="text-right">Tickets impr.</th></tr></thead>
    <tbody>
    @forelse ($report['ticket_details'] ?? [] as $ticket)
        <tr class="{{ $ticket['is_deleted'] ? 'deleted' : '' }}">
            <td>#{{ $ticket['id'] }}</td><td>{{ $ticket['created_at'] ? \Carbon\Carbon::parse($ticket['created_at'])->format('H:i') : '-' }}</td><td>{{ $ticket['employee_name'] }}</td><td>{{ $ticket['client_name'] }}</td><td>{{ $ticket['label'] ?: ($ticket['category'] ?? 'Autre') }}</td><td>{{ $ticket['is_deleted'] ? 'Supprime' : 'Actif' }}</td><td class="text-right">{{ number_format($ticket['total'], 2, ',', ' ') }} MAD</td><td class="text-right">{{ $ticket['printed_ticket_count'] ?? (($ticket['print_count'] ?? 0) * 2) }}</td>
        </tr>
    @empty
        <tr><td colspan="8" class="muted">Aucun ticket.</td></tr>
    @endforelse
    </tbody>
</table>
</body>
</html>
