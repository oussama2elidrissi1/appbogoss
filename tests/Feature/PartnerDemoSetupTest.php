<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Partner;
use App\Models\PartnerOffering;
use App\Models\PartnerQrToken;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** La commande partner:demo-setup : compte complet, relançable, sans toucher à la caisse. */
class PartnerDemoSetupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        Storage::fake('public');
    }

    private function run_(): void
    {
        $this->artisan('partner:demo-setup', ['--password' => 'DemoPartner-2026'])->assertSuccessful();
    }

    public function test_creates_a_fully_equipped_partner_that_can_log_in(): void
    {
        $this->run_();

        $user = User::where('email', 'partenaire.demo@bogosland.com')->firstOrFail();
        $this->assertTrue($user->hasRole('partner'));

        $partner = Partner::where('user_id', $user->id)->firstOrFail();
        $this->assertSame(Partner::STATUS_ACTIVE, $partner->status);
        $this->assertNotNull($partner->logo_url);
        Storage::disk('public')->assertExists('partners/demo-riad-atlas-logo.png');
        Storage::disk('public')->assertExists('partners/demo-riad-atlas-cover.jpg');

        $this->assertNotNull($partner->landingSetting->cover_image_url);
        $this->assertNotNull(PartnerQrToken::where('partner_id', $partner->id)->whereNull('revoked_at')->first());
        $this->assertGreaterThan(0, $partner->commissions()->count());
        $this->assertGreaterThan(0, PartnerOffering::where('partner_id', $partner->id)->count());
        $this->assertGreaterThan(0, $partner->clients()->count());
        $this->assertTrue(Appointment::where('partner_id', $partner->id)->where('starts_at', '>', now())->exists());

        $response = $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'DemoPartner-2026',
            'device_name' => 'demo-device',
        ])->assertOk();
        $this->assertNotEmpty($response->json('token'));
        $this->assertContains('partner', $response->json('account.roles'));
    }

    public function test_is_idempotent(): void
    {
        $this->run_();
        $counts = fn () => [
            User::count(), Partner::count(), Service::count(),
            PartnerOffering::count(), Appointment::count(),
            \App\Models\Client::count(), \App\Models\ServicePack::count(),
            \App\Models\PartnerServiceCommission::count(), PartnerQrToken::count(),
        ];
        $before = $counts();

        $this->run_();

        $this->assertSame($before, $counts());
    }

    public function test_creates_no_prestation_nor_commission_ledger(): void
    {
        $this->run_();

        $this->assertSame(0, \App\Models\Prestation::count());
        $this->assertSame(0, \App\Models\PartnerCommission::count());
    }
}
