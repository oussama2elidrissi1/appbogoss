<?php

namespace App\Services;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request as RequestFacade;

/**
 * Records the audit trail entries explicitly required by the spec (logins,
 * employee CRUD, prestation lifecycle, payment confirmation, ticket
 * print/reprint, commission edits, caisse open/close). Called directly from
 * services/controllers at each of those points — not a blanket model
 * observer, so the log only contains meaningful business events.
 */
class ActivityLogger
{
    /**
     * @param  array<string, mixed>  $old
     * @param  array<string, mixed>  $new
     */
    public function log(string $action, ?Model $subject = null, array $old = [], array $new = []): void
    {
        ActivityLog::create([
            'user_id' => Auth::id(),
            'client_id' => Auth::guard('client')->id(),
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'old_values' => $old ?: null,
            'new_values' => $new ?: null,
            'ip_address' => RequestFacade::ip(),
        ]);
    }
}
