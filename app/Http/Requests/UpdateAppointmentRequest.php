<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAppointmentRequest extends FormRequest
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
            'client_id' => ['sometimes', 'nullable', 'integer', Rule::exists('clients', 'id')],
            'client_ids' => ['sometimes', 'array', 'min:1', 'max:20'],
            'client_ids.*' => ['integer', Rule::exists('clients', 'id')],
            'employee_id' => ['sometimes', 'required', 'integer', Rule::exists('employees', 'id')],
            'service_id' => ['sometimes', 'required', 'integer', Rule::exists('services', 'id')],
            'starts_at' => ['sometimes', 'required', 'date'],
            'status' => ['sometimes', 'required', 'string', Rule::in(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['sometimes', 'array', 'min:1', 'max:20'],
            'items.*.service_id' => ['required_with:items', 'integer', Rule::exists('services', 'id')],
            'items.*.employee_id' => ['required_with:items', 'integer', Rule::exists('employees', 'id')],
        ];
    }
}
