<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Date de démarrage du portefeuille
    |--------------------------------------------------------------------------
    |
    | Le Wallet est un NOUVEAU point de départ financier. Tout ce qui précède
    | cette date reste consultable dans les rapports historiques (rapports par
    | jour, historique des caisses, clôtures mensuelles) mais n'alimente jamais
    | un solde de portefeuille : aucun backfill, aucune écriture rétroactive.
    |
    | Concrètement, `WalletService::creditWorkDayResult()` ignore purement et
    | simplement une journée de caisse dont la `date` est antérieure — y compris
    | si cette journée est consultée, modifiée ou re-clôturée après l'installation.
    |
    | Ce n'est PAS une borne mensuelle : le solde est continu, il ne se remet
    | jamais à zéro au changement de mois. Les mois ne servent qu'aux filtres et
    | aux rapports.
    |
    */

    'start_date' => env('WALLET_START_DATE', '2026-09-01'),

    /*
    |--------------------------------------------------------------------------
    | Portefeuille du patron
    |--------------------------------------------------------------------------
    |
    | « Envoyer au Super Admin » a besoin d'une destination unique et stable.
    | Quand plusieurs comptes super-admin coexistent, ce réglage désigne celui
    | qui tient la caisse du patron ; sans lui, le premier super-admin créé
    | (plus petit id) fait foi. La vue globale, elle, agrège de toute façon tous
    | les portefeuilles de type `super_admin`, donc aucun montant ne disparaît
    | si le réglage change en cours de route.
    |
    */

    'super_admin_user_id' => env('WALLET_SUPER_ADMIN_USER_ID'),

];
