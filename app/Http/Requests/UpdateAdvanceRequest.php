<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAdvanceRequest extends FormRequest
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
            'amount' => ['sometimes', 'required', 'numeric', 'min:0.01'],
            'reason' => ['sometimes', 'nullable', 'string'],
            'given_on' => ['sometimes', 'required', 'date'],
            // Super Admin bypasses this entirely (see AdvanceController::assertPatronPassword);
            // for everyone else it's enforced there too, since it must survive being stripped here.
            'password' => ['nullable', 'string'],
        ];
    }
}
