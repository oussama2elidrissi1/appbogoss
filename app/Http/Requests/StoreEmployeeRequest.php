<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmployeeRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('employees', 'email')],
            'phone' => ['nullable', 'string', 'max:30'],
            'avatar_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'specialties' => ['nullable', 'array'],
            'specialties.*' => ['string', 'max:80'],
            'is_active' => ['sometimes', 'boolean'],
            'default_commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'login_email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')],
            'login_password' => ['nullable', 'string', 'min:8', 'required_with:login_email'],
            'system_role' => ['nullable', Rule::in(['admin', 'employee'])],
        ];
    }
}
