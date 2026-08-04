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
        $employee = $this->route('employee');
        $employeeId = $employee?->id;
        $userId = $employee?->user_id;

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
            'login_email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'login_password' => ['nullable', 'string', 'min:8'],
            'system_role' => ['nullable', Rule::in(['admin', 'employee'])],
        ];
    }
}
