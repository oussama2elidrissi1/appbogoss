<?php

/*
 * Caisse (POS V2).
 *
 * `collected_totals_from` — à partir de cette date (date métier de la
 * facture), l'historique caisse compte les pourboires dans ses totaux
 * « encaissé » : CA encaissé, moyenne facture, CA par employé, total de la
 * page. C'est ce qui fait que l'entête retombe exactement sur la somme des
 * lignes affichées, qui montrent depuis toujours le total encaissé pourboire
 * compris.
 *
 * Les journées ANTÉRIEURES à cette date gardent les chiffres qu'elles ont
 * toujours affichés — ils ont été lus, rapprochés et clôturés ainsi, et les
 * recalculer après coup ferait mentir l'historique.
 *
 * Ce réglage ne touche QUE l'écran d'historique. Le CA du salon lui-même
 * (Sale.total, rapport de clôture, portefeuille) reste toujours hors
 * pourboires : un pourboire appartient à l'employé, pas au salon (§40).
 */
return [
    'collected_totals_from' => env('POS_COLLECTED_TOTALS_FROM', '2026-09-04'),
];
