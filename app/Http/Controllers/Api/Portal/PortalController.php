<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Http\Resources\PortalClientResource;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class PortalController extends Controller
{
    public function __construct(private readonly ActivityLogger $activityLogger)
    {
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new PortalClientResource($request->user()->loadMissing('loyaltyAccount'))]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $client = $request->user();

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'birth_date' => ['sometimes', 'nullable', 'date', 'before:today'],
            'gender' => ['sometimes', 'nullable', Rule::in(['female', 'male', 'other'])],
            'marketing_consent' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('marketing_consent', $validated)) {
            $validated['consent_marketing_at'] = $validated['marketing_consent'] ? now() : null;
            unset($validated['marketing_consent']);
        }

        $client->update($validated);

        return response()->json(['data' => new PortalClientResource($client->fresh('loyaltyAccount'))]);
    }

    public function logout(Request $request): JsonResponse
    {
        $client = $request->user();
        $this->activityLogger->log('loyalty.customer_logout', $client);

        Auth::guard('client')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(null, 204);
    }
}
