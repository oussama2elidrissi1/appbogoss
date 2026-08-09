<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->safe()->only(['email', 'password']);

        // Defaults to a persistent session (historic behaviour) unless the
        // user explicitly unchecks "Se souvenir de moi".
        if (! Auth::attempt($credentials, $request->boolean('remember', true))) {
            return response()->json([
                'message' => 'Identifiants invalides',
            ], 401);
        }

        if (! $request->user()->is_active) {
            Auth::guard('web')->logout();

            return response()->json([
                'message' => 'Ce compte a été désactivé.',
            ], 403);
        }

        $request->session()->regenerate();

        $this->activityLogger->log('auth.login', $request->user());

        return response()->json(
            new UserResource($request->user())
        );
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(null, 204);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(
            new UserResource($request->user())
        );
    }
}
