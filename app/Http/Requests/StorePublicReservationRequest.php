<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * La prise de rendez-vous publique : le strict nécessaire, nettoyé.
 *
 * `starts_at` est une heure murale du salon (`Y-m-d H:i`), la convention de
 * tout l'agenda. Les règles métier (créneau passé, salon fermé, employé
 * occupé, téléphone marocain valide) vivent dans PublicBookingService — ici
 * seulement la forme.
 */
class StorePublicReservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer', Rule::exists('services', 'id')],
            'starts_at' => ['required', 'date_format:Y-m-d H:i'],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', 'string', 'min:9', 'max:40'],
            'email' => ['nullable', 'email', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
