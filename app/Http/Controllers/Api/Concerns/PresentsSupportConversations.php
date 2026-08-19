<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\SupportConversation;
use Illuminate\Support\Str;

/** Shared response-shaping for the support chat, used by both the partner and admin controllers. */
trait PresentsSupportConversations
{
    private function summarizeConversation(SupportConversation $conversation, bool $isStaff): array
    {
        $lastMessage = $conversation->messages->last();
        $lastReadAt = $isStaff ? $conversation->admin_last_read_at : $conversation->partner_last_read_at;

        return [
            'id' => $conversation->id,
            'partner_id' => $conversation->partner_id,
            'partner_name' => $conversation->partner?->name,
            'subject' => $conversation->subject,
            'status' => $conversation->status,
            'last_message_preview' => $lastMessage ? Str::limit($lastMessage->body, 80) : null,
            'last_message_at' => $conversation->last_message_at?->toIso8601String(),
            'unread' => $conversation->last_message_at !== null
                && (! $lastReadAt || $lastReadAt->lt($conversation->last_message_at)),
        ];
    }

    private function detailConversation(SupportConversation $conversation): array
    {
        return [
            'id' => $conversation->id,
            'partner_id' => $conversation->partner_id,
            'partner_name' => $conversation->partner?->name,
            'subject' => $conversation->subject,
            'status' => $conversation->status,
            'messages' => $conversation->messages->map(fn ($message) => [
                'id' => $message->id,
                'body' => $message->body,
                'author' => $message->user?->name,
                'is_staff' => $message->user?->hasRole(['admin', 'super-admin']) ?? false,
                'created_at' => $message->created_at?->toIso8601String(),
            ]),
        ];
    }
}
