<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePartnerRequest extends FormRequest
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
        $partner = $this->route('partner');

        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'ice' => ['nullable', 'string', 'max:50'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
            'status' => ['sometimes', Rule::in(['pending', 'active', 'suspended', 'disabled'])],
            'payment_holder_name' => ['nullable', 'string', 'max:255'],
            'payment_bank_name' => ['nullable', 'string', 'max:255'],
            'payment_iban' => ['nullable', 'string', 'max:64'],
            'payment_method_preference' => ['nullable', 'string', 'max:50'],
            'login_email' => [
                'sometimes',
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($partner?->user_id),
            ],
            'login_password' => ['nullable', 'string', 'min:8'],
            'commissions' => ['sometimes', 'array', 'max:200'],
            'commissions.*.service_id' => ['required', 'integer', 'distinct', Rule::exists('services', 'id')],
            'commissions.*.type' => ['required', Rule::in(['percentage', 'fixed'])],
            'commissions.*.value' => ['required', 'numeric', 'min:0', 'max:100000'],
        ];
    }
}
