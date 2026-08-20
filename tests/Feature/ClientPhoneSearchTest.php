<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Partner;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Phone search must be format-blind: numbers were typed in over months as
 * "0668…", "+212668…", "+212 660-879882"… and nobody remembers which format a
 * given fiche used. Whatever digits the operator types must find the client.
 */
class ClientPhoneSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
    }

    private function searchNames(string $term): array
    {
        return collect($this->getJson('/api/clients?search='.urlencode($term))->assertOk()->json('data'))
            ->pluck('name')
            ->all();
    }

    public function test_local_format_search_finds_a_client_stored_in_international_format(): void
    {
        Client::factory()->create(['name' => 'Anouar', 'phone' => '+212668895489']);

        $this->assertSame(['Anouar'], $this->searchNames('0668895489'));
    }

    public function test_international_search_finds_a_client_stored_in_local_format(): void
    {
        Client::factory()->create(['name' => 'Abdelhakim', 'phone' => '0661129029']);

        $this->assertSame(['Abdelhakim'], $this->searchNames('+212661129029'));
        $this->assertSame(['Abdelhakim'], $this->searchNames('212661129029'));
    }

    public function test_separators_in_the_stored_number_do_not_break_the_match(): void
    {
        Client::factory()->create(['name' => 'Mohammed', 'phone' => '+212 660-879882']);

        $this->assertSame(['Mohammed'], $this->searchNames('0660879882'));
        $this->assertSame(['Mohammed'], $this->searchNames('660 87 98 82'));
    }

    public function test_partial_digits_are_enough(): void
    {
        Client::factory()->create(['name' => 'Anouar', 'phone' => '+212668895489']);
        Client::factory()->create(['name' => 'Abdelhakim', 'phone' => '0661129029']);

        // The operator only remembers the start of the number.
        $this->assertSame(['Anouar'], $this->searchNames('0668'));
    }

    public function test_foreign_numbers_still_match_across_formats(): void
    {
        Client::factory()->create(['name' => 'Toufik', 'phone' => '+33 6 37 01 47 46']);

        $this->assertSame(['Toufik'], $this->searchNames('+33637014746'));
        $this->assertSame(['Toufik'], $this->searchNames('37 01 47 46'));
    }

    public function test_name_search_still_works_and_short_digit_terms_do_not_flood_results(): void
    {
        Client::factory()->create(['name' => 'Anouar', 'phone' => '+212668895489']);
        Client::factory()->create(['name' => 'Fayk', 'phone' => '0661086444']);

        $this->assertSame(['Anouar'], $this->searchNames('Anouar'));
        // "06" alone matches nothing digit-wise (too short to be discriminating)
        // and no name/raw phone contains it as text except stored "06…" numbers.
        $this->assertSame(['Fayk'], $this->searchNames('06'));
    }

    public function test_partner_portal_search_is_also_format_blind_and_stays_scoped(): void
    {
        $user = User::factory()->create(['role' => 'partner']);
        $user->assignRole('partner');
        $partner = Partner::create(['name' => 'Hotel Atlas', 'is_active' => true, 'user_id' => $user->id]);

        Client::factory()->create(['name' => 'Client Du Partenaire', 'phone' => '+212612345678', 'partner_id' => $partner->id]);
        // Same number stored on a BOGOSLAND client — must never leak to the partner.
        Client::factory()->create(['name' => 'Client BOGOSLAND', 'phone' => '0612345678', 'partner_id' => null]);

        Sanctum::actingAs($user);
        $names = collect($this->getJson('/api/partner/clients?search=0612345678')->assertOk()->json('data'))
            ->pluck('name')
            ->all();

        $this->assertSame(['Client Du Partenaire'], $names);
    }
}
