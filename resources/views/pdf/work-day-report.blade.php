<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Rapport de journée - {{ $day->date->toDateString() }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        h2 { font-size: 14px; margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        .summary td { padding: 4px 8px; }
        .summary td.label { font-weight: bold; width: 260px; }
        .text-right { text-align: right; }
    </style>
</head>
<body>
    <h1>BOGOSLAND - Rapport de journée</h1>
    <p>
        Date : {{ $day->date->toDateString() }}<br>
        Ouverte par : {{ $day->openedBy->name ?? 'N/A' }}<br>
        Fonds de caisse : {{ number_format((float) $day->opening_balance, 2) }} MAD
    </p>

    @php($report = $day->closing_report ?? [])

    <h2>Résumé</h2>
    <table class="summary">
        <tr><td class="label">Chiffre d'affaires</td><td>{{ number_format($report['revenue_total'] ?? 0, 2) }} MAD</td></tr>
        <tr><td class="label">Dépenses</td><td>{{ number_format($report['expenses_total'] ?? 0, 2) }} MAD</td></tr>
        <tr><td class="label">Avances</td><td>{{ number_format($report['advances_total'] ?? 0, 2) }} MAD</td></tr>
        <tr><td class="label">Commissions</td><td>{{ number_format($report['commissions_total'] ?? 0, 2) }} MAD</td></tr>
        <tr><td class="label">Résultat net</td><td>{{ number_format($report['net_result'] ?? 0, 2) }} MAD</td></tr>
        <tr><td class="label">Nombre de clients</td><td>{{ $report['clients_count'] ?? 0 }}</td></tr>
        <tr><td class="label">Ticket moyen</td><td>{{ number_format($report['average_ticket'] ?? 0, 2) }} MAD</td></tr>
    </table>

    <h2>Chiffre d'affaires par catégorie</h2>
    <table>
        <thead>
            <tr><th>Catégorie</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr>
        </thead>
        <tbody>
            @forelse (($report['revenue_by_category'] ?? []) as $row)
                <tr>
                    <td>{{ $row['category'] }}</td>
                    <td class="text-right">{{ $row['count'] }}</td>
                    <td class="text-right">{{ number_format($row['total'], 2) }} MAD</td>
                </tr>
            @empty
                <tr><td colspan="3">Aucune donnée</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Chiffre d'affaires par employé</h2>
    <table>
        <thead>
            <tr><th>Employé</th><th class="text-right">Nombre</th><th class="text-right">Total</th><th class="text-right">Commission</th></tr>
        </thead>
        <tbody>
            @forelse (($report['revenue_by_employee'] ?? []) as $row)
                <tr>
                    <td>{{ $row['employee_name'] }}</td>
                    <td class="text-right">{{ $row['count'] }}</td>
                    <td class="text-right">{{ number_format($row['total'], 2) }} MAD</td>
                    <td class="text-right">{{ number_format($row['commission'], 2) }} MAD</td>
                </tr>
            @empty
                <tr><td colspan="4">Aucune donnée</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>DÃ©tails avances</h2>
    <table>
        <thead>
            <tr><th>EmployÃ©</th><th>Motif</th><th>Statut</th><th class="text-right">Montant</th></tr>
        </thead>
        <tbody>
            @forelse ($day->advances as $advance)
                <tr>
                    <td>{{ $advance->employee->name ?? 'EmployÃ©' }}</td>
                    <td>{{ $advance->reason ?: 'Sans motif' }}</td>
                    <td>{{ $advance->settled_at ? 'RÃ©glÃ©e' : 'Non rÃ©glÃ©e' }}</td>
                    <td class="text-right">{{ number_format((float) $advance->amount, 2) }} MAD</td>
                </tr>
            @empty
                <tr><td colspan="4">Aucune avance</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Top prestations</h2>
    <table>
        <thead>
            <tr><th>Prestation</th><th class="text-right">Nombre</th><th class="text-right">Total</th></tr>
        </thead>
        <tbody>
            @forelse (($report['top_prestations'] ?? []) as $row)
                <tr>
                    <td>{{ $row['label'] }}</td>
                    <td class="text-right">{{ $row['count'] }}</td>
                    <td class="text-right">{{ number_format($row['total'], 2) }} MAD</td>
                </tr>
            @empty
                <tr><td colspan="3">Aucune donnée</td></tr>
            @endforelse
        </tbody>
    </table>
</body>
</html>
