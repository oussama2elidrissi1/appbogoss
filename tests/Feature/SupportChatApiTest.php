<?php

namespace Tests\Feature;

use App\Models\Partner;
use App\Models\SupportConversation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SupportChatApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function createPartnerWithAccount(array $overrides = []): Partner
    {
        $user = User::factory()->create([
            'email' => $overrides['email'] ?? 'partner@test.com',
            'password' => Hash::make('secret-pass'),
            'role' => 'partner',
        ]);
        $user->assignRole('partner');

        return Partner::create(array_merge([
            'name' => 'Hotel Atlas',
            'is_active' => true,
            'user_id' => $user->id,
        ], $overrides['partner'] ?? []));
    }

    public function test_partner_can_start_a_conversation_and_it_notifies_staff(): void
    {
        $admin = $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        Sanctum::actingAs($partner->user);

        $created = $this->postJson('/api/partner/support/conversations', [
            'subject' => 'Question sur RSV-0023',
            'body' => 'Bonjour, j\'ai une question.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'nouveau')
            ->assertJsonCount(1, 'data.messages')
            ->json('data');

        $this->assertDatabaseHas('support_conversations', [
            'id' => $created['id'],
            'partner_id' => $partner->id,
        ]);
        $this->assertDatabaseHas('notifications', ['notifiable_id' => $admin->id]);
    }

    public function test_partner_cannot_see_or_reply_to_another_partners_conversation(): void
    {
        $this->actingAsAdmin();
        $ownerPartner = $this->createPartnerWithAccount();
        $otherPartner = $this->createPartnerWithAccount(['email' => 'other@test.com', 'partner' => ['name' => 'Other']]);

        Sanctum::actingAs($ownerPartner->user);
        $conversation = $this->postJson('/api/partner/support/conversations', [
            'subject' => 'Sujet',
            'body' => 'Message initial',
        ])->json('data');

        Sanctum::actingAs($otherPartner->user);
        $this->getJson("/api/partner/support/conversations/{$conversation['id']}")->assertForbidden();
        $this->postJson("/api/partner/support/conversations/{$conversation['id']}/messages", [
            'body' => 'Intrusion',
        ])->assertForbidden();

        $this->getJson('/api/partner/support/conversations')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_admin_sees_every_partners_conversations_and_can_reply(): void
    {
        $this->actingAsAdmin();
        $partnerA = $this->createPartnerWithAccount();
        $partnerB = $this->createPartnerWithAccount(['email' => 'b@test.com', 'partner' => ['name' => 'B']]);

        Sanctum::actingAs($partnerA->user);
        $conversationA = $this->postJson('/api/partner/support/conversations', [
            'subject' => 'A', 'body' => 'msg a',
        ])->json('data');

        Sanctum::actingAs($partnerB->user);
        $this->postJson('/api/partner/support/conversations', ['subject' => 'B', 'body' => 'msg b'])->assertCreated();

        $this->actingAsAdmin();
        $this->getJson('/api/support/conversations')->assertOk()->assertJsonCount(2, 'data');

        $reply = $this->postJson("/api/support/conversations/{$conversationA['id']}/messages", [
            'body' => 'Réponse BOGOSLAND',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'en_cours')
            ->json('data');

        $this->assertCount(2, $reply['messages']);
        $this->assertDatabaseHas('notifications', ['notifiable_id' => $partnerA->user_id]);
    }

    public function test_partner_replying_to_a_resolved_conversation_reopens_it(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        Sanctum::actingAs($partner->user);

        $conversation = $this->postJson('/api/partner/support/conversations', [
            'subject' => 'S', 'body' => 'm',
        ])->json('data');

        $this->actingAsAdmin();
        $this->patchJson("/api/support/conversations/{$conversation['id']}/status", ['status' => 'resolu'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolu');

        Sanctum::actingAs($partner->user);
        $this->postJson("/api/partner/support/conversations/{$conversation['id']}/messages", ['body' => 'Encore un souci'])
            ->assertOk()
            ->assertJsonPath('data.status', 'en_cours');
    }

    public function test_non_partner_account_is_forbidden_from_partner_support_endpoints(): void
    {
        $employee = User::factory()->create();
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $this->getJson('/api/partner/support/conversations')->assertForbidden();
    }

    public function test_admin_can_change_conversation_status(): void
    {
        $this->actingAsAdmin();
        $partner = $this->createPartnerWithAccount();
        $conversation = SupportConversation::create([
            'partner_id' => $partner->id,
            'subject' => 'S',
            'status' => 'nouveau',
        ]);

        $this->patchJson("/api/support/conversations/{$conversation->id}/status", ['status' => 'ferme'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ferme');

        $this->patchJson("/api/support/conversations/{$conversation->id}/status", ['status' => 'invalid'])
            ->assertStatus(422);
    }
}
