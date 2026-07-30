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
        'is_active',
        'is_company',
        'company_area',
        'default_commission_rate',
    ];

    protected $casts = [
        'specialties' => 'array',
        'is_active' => 'boolean',
        'is_company' => 'boolean',
        'default_commission_rate' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
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
}
