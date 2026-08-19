<?php

namespace App\Http\Controllers\Api\Partner\Concerns;

use App\Models\Partner;
use Illuminate\Http\Request;

/**
 * Every partner-portal endpoint is scoped to the authenticated account's own
 * Partner record — never to whatever `partner_id` a request might carry.
 * Login itself already requires an active User; a suspended/pending Partner
 * can still sign in and see their own history (only booking creation is
 * blocked, in AppointmentController::restrictedPartner()).
 */
trait RequiresActivePartner
{
    protected function currentPartner(Request $request): Partner
    {
        $partner = $request->user()?->partner;

        abort_unless($partner !== null, 403, 'Aucun compte partenaire n’est associé à cet utilisateur.');

        return $partner;
    }
}
