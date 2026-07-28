<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAppointmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'client_id' => ['required', 'integer', Rule::exists('clients', 'id')],
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')],
            'service_id' => ['required', 'integer', Rule::exists('services', 'id')],
            'starts_at' => ['required', 'date'],
            'status' => ['sometimes', 'string', Rule::in(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
