<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
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
        $employeeId = $this->route('employee')?->id;

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'role' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('employees', 'email')->ignore($employeeId),
            ],
            'phone' => ['nullable', 'string', 'max:30'],
            'avatar_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'specialties' => ['nullable', 'array'],
            'specialties.*' => ['string', 'max:80'],
            'is_active' => ['sometimes', 'boolean'],
            'default_commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }
}
