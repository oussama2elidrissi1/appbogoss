<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePrestationRequest extends FormRequest
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
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'client_label' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['nullable', 'array'],
            'items.*.service_id' => ['nullable', 'integer', 'exists:services,id'],
            'items.*.label' => ['required_without:items.*.service_id', 'nullable', 'string', 'max:255'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.duration_minutes' => ['nullable', 'integer', 'min:0'],
            'items.*.notes' => ['nullable', 'string', 'max:500'],
            'items.*.loyalty_reward_id' => ['nullable', 'integer', 'exists:loyalty_rewards,id'],
            'items.*.client_subscription_id' => ['nullable', 'integer', 'exists:client_subscriptions,id'],
            'items.*.subscription_plan_service_id' => ['nullable', 'integer', 'exists:subscription_plan_services,id'],
            'items.*.exception_override' => ['nullable', 'boolean'],
            'items.*.override_reason' => ['nullable', 'required_if:items.*.exception_override,true', 'string', 'max:500'],
        ];
    }
}
