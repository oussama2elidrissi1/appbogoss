<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\Employee;
use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Appointment>
 */
class AppointmentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startsAt = fake()->dateTimeBetween('-30 days', '+14 days');
        $duration = fake()->numberBetween(15, 120);
        $endsAt = (clone $startsAt)->modify("+{$duration} minutes");

        return [
            'client_id' => Client::factory(),
            'employee_id' => Employee::factory(),
            'service_id' => Service::factory(),
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'status' => fake()->randomElement(['confirmed', 'completed', 'cancelled', 'pending']),
            'notes' => fake()->optional(0.2)->sentence(),
        ];
    }
}
