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
            'client_id' => ['nullable', 'integer', Rule::exists('clients', 'id')],
            'client_ids' => ['sometimes', 'array', 'min:1', 'max:20'],
            'client_ids.*' => ['integer', Rule::exists('clients', 'id')],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'service_id' => ['required_without:items', 'integer', Rule::exists('services', 'id')],
            'starts_at' => ['required', 'date'],
            'status' => ['sometimes', 'string', Rule::in(['pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'refused'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['sometimes', 'array', 'min:1', 'max:40'],
            'items.*.service_id' => ['required_with:items', 'integer', Rule::exists('services', 'id')],
            'items.*.employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'items.*.person_index' => ['nullable', 'integer', 'min:0', 'max:19'],
            'items.*.uid' => ['nullable', 'string', 'max:40'],
            'people' => ['sometimes', 'array', 'min:1', 'max:20'],
            'people.*.name' => ['nullable', 'string', 'max:120'],
            'partner_id' => ['sometimes', 'nullable', 'integer', Rule::exists('partners', 'id')],
            'duration_override_minutes' => ['sometimes', 'nullable', 'integer', 'min:5', 'max:720'],
        ];
    }
}
