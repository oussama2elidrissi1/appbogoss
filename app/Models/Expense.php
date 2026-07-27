<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Expense extends Model
{
    use HasFactory;

    protected $fillable = [
        'label',
        'category',
        'amount',
        'spent_on',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'spent_on' => 'date',
    ];
}
