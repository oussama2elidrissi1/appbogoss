<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Rapport mensuel - {{ $report['period']['month'] }}</title>
    <style>
        @page { margin: 26px 28px 34px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 9px; color: #1d2939; }
        h1 { color: #132238; font-size: 19px; margin: 0; }
        h2 { color: #132238; font-size: 12px; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #c8a24c; }
        h3 { color: #43546b; font-size: 10px; margin: 12px 0 5px; }
        .header { border-bottom: 1px solid #d6dde7; padding-bottom: 12px; }
        .brand { color: #c8a24c; font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
        .meta, .muted { color: #63758a; }
        .grid { width: 100%; border-collapse: separate; border-spacing: 5px; margin: 5px -5px 0; }
        .metric { background: #f2f5f8; border: 1px solid #d9e0e8; padding: 7px; width: 25%; }
        .metric .label { color: #63758a; font-size: 7px; font-weight: bold; text-transform: uppercase; }
        .metric .value { color: #132238; font-size: 12px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        th, td { border-bottom: 1px solid #e0e5eb; padding: 5px 6px; vertical-align: top; }
        th { background: #edf1f5; color: #43546b; font-size: 8px; text-align: left; text-transform: uppercase; }
        .text-right { text-align: right; }
        .two { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px; }
        .two > tbody > tr > td { border: 0; padding: 0 12px 0 0; width: 50%; vertical-align: top; }
        .page-break { page-break-before: always; }
    </style>
</head>
<body>
@php($totals = $report['totals'] ?? [])
<div class="header">
    <div class="brand">Bogosland Manager</div>
    <h1>Rapport mensuel de caisse</h1>
    <p class="meta">Periode : <strong>{{ $report['period']['start'] }} au {{ $report['period']['end'] }}</strong></p>
</div>

<table class="grid">
    <tr>
        @foreach ([
            ['CA', $totals['revenue_total'] ?? 0],
            ['Depenses', $totals['expenses_total'] ?? 0],
            ['Avances', $totals['advances_total'] ?? 0],
            ['Resultat de la caisse', $totals['net_result'] ?? 0],
        ] as $metric)
            <td class="metric"><div class="label">{{ $metric[0] }}</div><div class="value">{{ number_format($metric[1], 2, ',', ' ') }} MAD</div></td>
        @endforeach
    </tr>
</table>
<p class="meta">
    {{ count($report['days'] ?? []) }} journee(s) de caisse - {{ $totals['ticket_count'] ?? 0 }} ticket(s) actif(s)
    - {{ $totals['deleted_ticket_count'] ?? 0 }} ticket(s) supprime(s)
    - {{ $totals['printed_ticket_count'] ?? 0 }} ticket(s) imprime(s)
</p>

<h2>Historique des journees</h2>
<table>
    <thead><tr><th>Date</th><th>Statut</th><th class="text-right">Tickets</th><th class="text-right">CA</th><th class="text-right">Depenses</th><th class="text-right">Avances</th><th class="text-right">Resultat</th></tr></thead>
    <tbody>
    @forelse ($report['days'] ?? [] as $day)
        <tr><td>{{ $day['date'] }}</td><td>{{ $day['status'] === 'closed' ? 'Cloturee' : 'Ouverte' }}</td><td class="text-right">{{ $day['tickets'] }}{{ $day['deleted_tickets'] ? ' + '.$day['deleted_tickets'].' suppr.' : '' }}</td><td class="text-right">{{ number_format($day['revenue_total'], 2, ',', ' ') }} MAD</td><td class="text-right">{{ number_format($day['expenses_total'], 2, ',', ' ') }} MAD</td><td class="text-right">{{ number_format($day['advances_total'], 2, ',', ' ') }} MAD</td><td class="text-right">{{ number_format($day['net_result'], 2, ',', ' ') }} MAD</td></tr>
    @empty
        <tr><td colspan="7" class="muted">Aucune journee sur cette periode.</td></tr>
    @endforelse
    </tbody>
</table>

<table class="two">
    <tr>
        <td>
            <h2>Employes et prestations</h2>
            <table>
                <thead><tr><th>Employe</th><th class="text-right">Tickets</th><th class="text-right">CA</th><th class="text-right">Commission</th></tr></thead>
                <tbody>
                @forelse (($totals['employee_by_prestation'] ?? $totals['revenue_by_employee'] ?? []) as $row)
                    <tr><td>{{ $row['employee_name'] }}<br><span class="muted">{{ collect($row['prestations'] ?? [])->map(fn ($item) => ($item['label'] ?? 'Prestation').' ('.($item['count'] ?? 0).')')->implode(', ') }}</span></td><td class="text-right">{{ $row['count'] }}</td><td class="text-right">{{ number_format($row['total'], 2, ',', ' ') }} MAD</td><td class="text-right">{{ number_format($row['commission'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="4" class="muted">Aucune donnee.</td></tr>
                @endforelse
                </tbody>
            </table>
        </td>
        <td>
            <h2>Prestations par employe</h2>
            <table>
                <thead><tr><th>Prestation</th><th>Employes</th><th class="text-right">Passages</th><th class="text-right">CA</th></tr></thead>
                <tbody>
                @forelse ($totals['prestation_by_employee'] ?? [] as $row)
                    <tr><td>{{ $row['label'] }}</td><td>{{ collect($row['employees'] ?? [])->map(fn ($item) => ($item['employee_name'] ?? 'Employe').' ('.($item['count'] ?? 0).')')->implode(', ') }}</td><td class="text-right">{{ $row['count'] }}</td><td class="text-right">{{ number_format($row['total'], 2, ',', ' ') }} MAD</td></tr>
                @empty
                    <tr><td colspan="4" class="muted">Aucune prestation.</td></tr>
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
            <table><thead><tr><th>Categorie</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr></thead><tbody>
            @forelse ($totals['expenses_by_category'] ?? [] as $row)
                <tr><td>{{ $row['category'] }}</td><td class="text-right">{{ $row['count'] }}</td><td class="text-right">{{ number_format($row['total'], 2, ',', ' ') }} MAD</td></tr>
            @empty <tr><td colspan="3" class="muted">Aucune depense.</td></tr> @endforelse
            </tbody></table>
            <h3>Detail</h3>
            <table><thead><tr><th>Date</th><th>Libelle</th><th class="text-right">Montant</th></tr></thead><tbody>
            @forelse ($totals['expense_details'] ?? [] as $row)
                <tr><td>{{ $row['spent_on'] }}</td><td>{{ $row['label'] }}</td><td class="text-right">{{ number_format($row['amount'] ?? $row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
            @empty <tr><td colspan="3" class="muted">Aucune depense.</td></tr> @endforelse
            </tbody></table>
        </td>
        <td>
            <h3>Avances par employe</h3>
            <table><thead><tr><th>Employe</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr></thead><tbody>
            @forelse ($totals['advances_by_employee'] ?? [] as $row)
                <tr><td>{{ $row['employee_name'] }}</td><td class="text-right">{{ $row['count'] }}</td><td class="text-right">{{ number_format($row['total'], 2, ',', ' ') }} MAD</td></tr>
            @empty <tr><td colspan="3" class="muted">Aucune avance.</td></tr> @endforelse
            </tbody></table>
            <h3>Detail</h3>
            <table><thead><tr><th>Date</th><th>Employe / Motif</th><th class="text-right">Montant</th></tr></thead><tbody>
            @forelse ($totals['advance_details'] ?? [] as $row)
                <tr><td>{{ $row['given_on'] }}</td><td>{{ $row['employee_name'] }}<br><span class="muted">{{ $row['reason'] ?: 'Sans motif' }}</span></td><td class="text-right">{{ number_format($row['amount'] ?? $row['total'] ?? 0, 2, ',', ' ') }} MAD</td></tr>
            @empty <tr><td colspan="3" class="muted">Aucune avance.</td></tr> @endforelse
            </tbody></table>
        </td>
    </tr>
</table>
</body>
</html>
