<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Restreint aux origines reelles du SPA.
    //
    // Constate en production : avec ['*'] ET supports_credentials a true,
    // Laravel renvoyait Access-Control-Allow-Origin en reflechissant
    // n'importe quelle origine (verifie avec une origine arbitraire), ce qui
    // annule la protection d'origine du navigateur.
    //
    // Aucun risque pour le SPA React : il est servi par Laravel lui-meme
    // (laravel-vite-plugin), ses appels /api/* sont donc same-origin et ne
    // declenchent aucun preflight — en developpement comme en production.
    //
    // L'application Flutter n'est pas concernee : un client HTTP natif
    // n'applique pas le CORS. Garder '*' "pour le mobile" n'apporterait rien
    // et ne ferait qu'affaiblir le web.
    //
    // Surchargeable par CORS_ALLOWED_ORIGINS (liste separee par des virgules)
    // si une origine supplementaire devient legitime.
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env(
            'CORS_ALLOWED_ORIGINS',
            'https://app.bogosland.com,https://www.app.bogosland.com'
        ))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
