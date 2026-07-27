<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'avatar_color',
        'loyalty_points',
        'notes',
        'last_visit_at',
    ];

    protected $casts = [
        'last_visit_at' => 'datetime',
        'loyalty_points' => 'integer',
    ];

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}
