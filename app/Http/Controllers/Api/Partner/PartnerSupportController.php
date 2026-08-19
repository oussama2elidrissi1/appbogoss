<?php

namespace App\Http\Controllers\Api\Partner;

use App\Http\Controllers\Api\Concerns\PresentsSupportConversations;
use App\Http\Controllers\Api\Partner\Concerns\RequiresActivePartner;
use App\Http\Controllers\Controller;
use App\Models\SupportConversation;
use App\Services\SupportNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** §24 — the partner's own side of the support chat, scoped to their own conversations. */
class PartnerSupportController extends Controller
{
    use RequiresActivePartner;
    use PresentsSupportConversations;

    public function __construct(private readonly SupportNotifier $notifier)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);

        $conversations = SupportConversation::where('partner_id', $partner->id)
            ->with('messages')
            ->orderByDesc('last_message_at')
            ->get()
            ->map(fn (SupportConversation $conversation) => $this->summarizeConversation($conversation, isStaff: false));

        return response()->json(['data' => $conversations]);
    }

    public function store(Request $request): JsonResponse
    {
        $partner = $this->currentPartner($request);
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $conversation = SupportConversation::create([
            'partner_id' => $partner->id,
            'subject' => $validated['subject'],
            'status' => SupportConversation::STATUS_NEW,
            'partner_last_read_at' => now(),
            'last_message_at' => now(),
        ]);
        $conversation->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $validated['body'],
        ]);

        $this->notifier->newMessageFromPartner($conversation);

        return response()->json(['data' => $this->detailConversation($conversation->fresh('messages.user'))], 201);
    }

    public function show(Request $request, SupportConversation $conversation): JsonResponse
    {
        $this->assertOwnership($request, $conversation);
        $conversation->update(['partner_last_read_at' => now()]);

        return response()->json(['data' => $this->detailConversation($conversation->load('messages.user'))]);
    }

    public function storeMessage(Request $request, SupportConversation $conversation): JsonResponse
    {
        $this->assertOwnership($request, $conversation);
        $validated = $request->validate(['body' => ['required', 'string', 'max:4000']]);

        $conversation->messages()->create(['user_id' => $request->user()->id, 'body' => $validated['body']]);
        $conversation->update([
            'last_message_at' => now(),
            'partner_last_read_at' => now(),
            // A partner replying to a resolved/closed thread reopens it.
            'status' => in_array($conversation->status, [SupportConversation::STATUS_RESOLVED, SupportConversation::STATUS_CLOSED], true)
                ? SupportConversation::STATUS_IN_PROGRESS
                : $conversation->status,
        ]);

        $this->notifier->newMessageFromPartner($conversation);

        return response()->json(['data' => $this->detailConversation($conversation->fresh('messages.user'))]);
    }

    private function assertOwnership(Request $request, SupportConversation $conversation): void
    {
        $partner = $this->currentPartner($request);
        abort_unless($conversation->partner_id === $partner->id, 403, 'Cette conversation ne vous appartient pas.');
    }
}
