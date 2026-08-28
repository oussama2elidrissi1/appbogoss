<?php

namespace App\Http\Controllers\Api\Mobile;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\PortalClientResource;
use App\Http\Resources\UserResource;
use App\Models\Client;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Staff authentication for the Flutter app.
 *
 * Deliberately a *parallel* surface rather than a change to AuthController:
 * the web SPA's /api/login establishes a cookie session and returns no token,
 * and must keep behaving exactly that way. This controller issues a Sanctum
 * personal access token and never touches the session — which also means it
 * must not call $request->session(), since mobile requests never run the
 * session middleware (EnsureFrontendRequestsAreStateful only promotes
 * requests coming from a stateful domain).
 *
 * Everything downstream is already token-ready: User has HasApiTokens, and
 * `auth:sanctum` resolves a bearer token into the same User the session guard
 * would have produced — so spatie's `permission:` middleware, the policies and
 * Gate::before all apply unchanged. No route is re-implemented here.
 */
class MobileAuthController extends Controller
{
    /** Per-account lockout on top of the IP-level `throttle:mobile-login`. */
    private const MAX_ATTEMPTS = 5;

    private const LOCKOUT_SECONDS = 300;

    public function __construct(private readonly ActivityLogger $activityLogger) {}

    /**
     * POST /api/mobile/login — email + password, returns a bearer token.
     *
     * Reuses LoginRequest so the validation rules can never drift from the web
     * login, and reproduces its two rejection paths verbatim: invalid
     * credentials => 401, deactivated account => 403 (checked BEFORE the token
     * is minted, so a disabled account never receives one).
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->safe()->only(['email', 'password']);

        // Keyed by email AND ip: keying on the email alone would let anyone
        // lock a known staff member out of the app by guessing badly on
        // purpose.
        $lockoutKey = 'mobile-login:'.$credentials['email'].'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($lockoutKey, self::MAX_ATTEMPTS)) {
            return response()->json([
                'message' => 'Trop de tentatives. Réessayez plus tard.',
            ], 429);
        }

        // Auth::attempt() would start a session; go through the same user
        // provider it uses instead, so credential handling (hashing, the
        // configured provider) stays identical without the session side effect.
        $provider = Auth::createUserProvider('users');
        $user = $provider->retrieveByCredentials($credentials);

        if ($user === null || ! $provider->validateCredentials($user, $credentials)) {
            RateLimiter::hit($lockoutKey, self::LOCKOUT_SECONDS);

            return response()->json([
                'message' => 'Identifiants invalides',
            ], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'message' => 'Ce compte a été désactivé.',
            ], 403);
        }

        RateLimiter::clear($lockoutKey);

        $token = $user->createToken($this->deviceName($request))->plainTextToken;

        $this->activityLogger->log('auth.mobile_login', $user);

        return response()->json([
            'token' => $token,
            'type' => 'staff',
            'account' => new UserResource($user),
        ]);
    }

    /**
     * GET /api/mobile/me — the account behind the token, whichever kind it is.
     *
     * One endpoint for both audiences on purpose: at cold start the app holds a
     * token from secure storage and does not necessarily know whether it is a
     * staff or a customer token. `auth:sanctum,client-api` tries the staff guard
     * first — a client token fails it on the provider check — then the customer
     * one. Answering here saves the app from probing /api/me and /api/client/me.
     */
    public function me(Request $request): JsonResponse
    {
        $account = $request->user();

        if ($account instanceof Client) {
            return response()->json([
                'type' => 'client',
                'account' => new PortalClientResource($account),
            ]);
        }

        return response()->json([
            'type' => 'staff',
            'account' => new UserResource($account),
        ]);
    }

    /**
     * POST /api/mobile/logout — revokes the calling token only.
     *
     * Distinct from /api/logout, which invalidates a session and would raise
     * "Session store not set on request" on a token-authenticated call. Other
     * devices of the same account keep their own tokens.
     */
    public function logout(Request $request): JsonResponse
    {
        $account = $request->user();
        $token = $account->currentAccessToken();

        // TransientToken when the caller authenticated through a browser
        // session rather than a bearer token — there is nothing to revoke.
        if (! $token instanceof PersonalAccessToken) {
            return response()->json([
                'message' => 'Cette requête n\'est pas authentifiée par un token.',
            ], 400);
        }

        $token->delete();

        $this->activityLogger->log('auth.mobile_logout', $account);

        return response()->json(null, 204);
    }

    /**
     * Names the token after the device so a user can tell their phones apart
     * in a future "connected devices" screen. Untrusted input — kept short.
     */
    private function deviceName(Request $request): string
    {
        $name = trim((string) $request->input('device_name', ''));

        return $name !== '' ? mb_substr($name, 0, 100) : 'mobile';
    }
}
