<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\PresentsSupportConversations;
use App\Http\Controllers\Controller;
use App\Models\SupportConversation;
use App\Services\SupportNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** §25 — the admin side of the support chat: every partner's conversations in one inbox. */
class SupportInboxController extends Controller
{
    use PresentsSupportConversations;

    public function __construct(private readonly SupportNotifier $notifier)
    {
    }

    public function index(): JsonResponse
    {
        $conversations = SupportConversation::with(['messages', 'partner'])
            ->orderByDesc('last_message_at')
            ->get()
            ->map(fn (SupportConversation $conversation) => $this->summarizeConversation($conversation, isStaff: true));

        return response()->json(['data' => $conversations]);
    }

    public function show(SupportConversation $conversation): JsonResponse
    {
        $conversation->update(['admin_last_read_at' => now()]);

        return response()->json(['data' => $this->detailConversation($conversation->load('messages.user'))]);
    }

    public function storeMessage(Request $request, SupportConversation $conversation): JsonResponse
    {
        $validated = $request->validate(['body' => ['required', 'string', 'max:4000']]);

        $conversation->messages()->create(['user_id' => $request->user()->id, 'body' => $validated['body']]);
        $conversation->update([
            'last_message_at' => now(),
            'admin_last_read_at' => now(),
            'status' => $conversation->status === SupportConversation::STATUS_NEW
                ? SupportConversation::STATUS_IN_PROGRESS
                : $conversation->status,
        ]);

        $this->notifier->newMessageFromStaff($conversation);

        return response()->json(['data' => $this->detailConversation($conversation->fresh('messages.user'))]);
    }

    public function updateStatus(Request $request, SupportConversation $conversation): JsonResponse
    {
        $validated = $request->validate(['status' => ['required', Rule::in(SupportConversation::STATUSES)]]);
        $conversation->update(['status' => $validated['status']]);

        return response()->json(['data' => $this->detailConversation($conversation->load('messages.user'))]);
    }
}
