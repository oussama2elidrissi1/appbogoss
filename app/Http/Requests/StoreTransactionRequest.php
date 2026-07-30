<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTransactionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'client_label' => ['nullable', 'string', 'max:255'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'category' => ['required', 'string', 'in:coiffure,hammam,massage,boisson,vitrine,autre'],
            'label' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'commission_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string'],
        ];
    }
}
