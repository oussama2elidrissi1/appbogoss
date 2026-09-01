<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'role',
        'email',
        'phone',
        'avatar_color',
        'specialties',
        'service_categories',
        'allowed_service_ids',
        'is_active',
        'is_company',
        'company_area',
        'default_commission_rate',
    ];

    protected $casts = [
        'specialties' => 'array',
        'service_categories' => 'array',
        'allowed_service_ids' => 'array',
        'is_active' => 'boolean',
        'is_company' => 'boolean',
        'default_commission_rate' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Ce que cet employe a REELLEMENT recu, depuis un portefeuille.
     *
     * A ne pas confondre avec `commissions` (ce qu'il a gagne) ni avec les
     * `commission_payouts` (le mois solde) : ces deux-la disent ce qui est
     * DU, celle-ci dit ce qui est SORTI.
     */
    public function walletPayments(): HasMany
    {
        return $this->hasMany(WalletTransaction::class)
            ->where('type', WalletTransaction::TYPE_EMPLOYEE_PAYMENT);
    }

    /**
     * Can this employee perform this service? Single source of truth for the
     * skills relation, mirroring exactly what "Nouvelle prestation" (Mon
     * espace) has always enforced on the frontend:
     *  - service_categories null/empty = no category restriction, otherwise
     *    the service's category must be listed;
     *  - allowed_service_ids null/empty = no further restriction, otherwise
     *    the service must be listed.
     * Company pseudo-employees (vitrine/réfrigérateur) and inactive
     * employees never perform human services.
     */
    public function canPerform(Service $service): bool
    {
        if (! $this->is_active || $this->is_company) {
            return false;
        }

        $categories = array_values(array_filter((array) ($this->service_categories ?? [])));
        if ($categories !== [] && ! in_array($service->category, $categories, true)) {
            return false;
        }

        $serviceIds = array_map('intval', array_values(array_filter(
            (array) ($this->allowed_service_ids ?? []),
            fn ($value) => $value !== null && $value !== '',
        )));
        if ($serviceIds !== [] && ! in_array((int) $service->id, $serviceIds, true)) {
            return false;
        }

        return true;
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function advances(): HasMany
    {
        return $this->hasMany(Advance::class);
    }

    public function prestations(): HasMany
    {
        return $this->hasMany(Prestation::class);
    }

    public function commissionRules(): HasMany
    {
        return $this->hasMany(EmployeeServiceCommission::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }

    public function commissionPayouts(): HasMany
    {
        return $this->hasMany(CommissionPayout::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(AppointmentReview::class);
    }

    public function supportConversations(): HasMany
    {
        return $this->hasMany(EmployeeSupportConversation::class);
    }
}
