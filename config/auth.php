<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | This option controls the default authentication "guard" and password
    | reset options for your application. You may change these defaults
    | as required, but they're a perfect start for most applications.
    |
    */

    'defaults' => [
        'guard' => 'web',
        'passwords' => 'users',
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Next, you may define every authentication guard for your application.
    | Of course, a great default configuration has been defined for you
    | here which uses session storage and the Eloquent user provider.
    |
    | All authentication drivers have a user provider. This defines how the
    | users are actually retrieved out of your database or other storage
    | mechanisms used by this application to persist your user's data.
    |
    | Supported: "session"
    |
    */

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],

        // Customer self-service portal — entirely separate from staff auth.
        // No password: identity is established via OTP, then
        // Auth::guard('client')->login($client) starts this guard's session.
        'client' => [
            'driver' => 'session',
            'provider' => 'clients',
        ],

        // Staff token guard, used by the Flutter app. Declared EXPLICITLY —
        // and this declaration is a security control, not boilerplate.
        // SanctumServiceProvider::register() otherwise registers this guard
        // with 'provider' => null, and Guard::hasValidProvider() returns true
        // unconditionally when the provider is null. With Client now carrying
        // HasApiTokens, a *customer* token would therefore satisfy
        // `auth:sanctum` and reach every staff route that has no additional
        // `permission:` gate. Pinning the provider to `users` makes
        // hasValidProvider() assert `$tokenable instanceof User`, so a client
        // token fails the staff guard outright.
        //
        // No effect on the web SPA: Guard::__invoke() resolves the `web`
        // session first (config('sanctum.guard') === ['web']) and never
        // reaches the token branch where the provider is checked.
        'sanctum' => [
            'driver' => 'sanctum',
            'provider' => 'users',
        ],

        // Token counterpart of the `client` session guard above, for the
        // mobile customer app. Pinned to `clients` for the same reason and in
        // the same direction: a staff token can never satisfy it.
        //
        // Caveat this guard CANNOT fix on its own: Guard::__invoke() loops
        // over the global config('sanctum.guard') (['web']) before looking at
        // the bearer token, for every sanctum guard instance alike. A browser
        // carrying a staff `web` session therefore satisfies `client-api` too.
        // That is why every route using this guard is additionally wrapped in
        // the `client.account` middleware, which asserts the resolved account
        // really is a Client.
        'client-api' => [
            'driver' => 'sanctum',
            'provider' => 'clients',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | All authentication drivers have a user provider. This defines how the
    | users are actually retrieved out of your database or other storage
    | mechanisms used by this application to persist your user's data.
    |
    | If you have multiple user tables or models you may configure multiple
    | sources which represent each model / table. These sources may then
    | be assigned to any extra authentication guards you have defined.
    |
    | Supported: "database", "eloquent"
    |
    */

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => App\Models\User::class,
        ],

        'clients' => [
            'driver' => 'eloquent',
            'model' => App\Models\Client::class,
        ],

        // 'users' => [
        //     'driver' => 'database',
        //     'table' => 'users',
        // ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | You may specify multiple password reset configurations if you have more
    | than one user table or model in the application and you want to have
    | separate password reset settings based on the specific user types.
    |
    | The expiry time is the number of minutes that each reset token will be
    | considered valid. This security feature keeps tokens short-lived so
    | they have less time to be guessed. You may change this as needed.
    |
    | The throttle setting is the number of seconds a user must wait before
    | generating more password reset tokens. This prevents the user from
    | quickly generating a very large amount of password reset tokens.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Password Confirmation Timeout
    |--------------------------------------------------------------------------
    |
    | Here you may define the amount of seconds before a password confirmation
    | times out and the user is prompted to re-enter their password via the
    | confirmation screen. By default, the timeout lasts for three hours.
    |
    */

    'password_timeout' => 10800,

];
