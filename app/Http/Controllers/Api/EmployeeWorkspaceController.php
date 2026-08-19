<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Employee;
use App\Models\EmployeeSupportConversation;
use App\Models\EmployeeSupportMessage;
use App\Services\EmployeeWorkspaceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeWorkspaceController extends Controller
{
    public function __construct(private readonly EmployeeWorkspaceService $workspace)
    {
    }

    public function dashboard(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->workspace->dashboard($this->employeeOrFail($request))]);
    }

    public function prestations(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'status' => ['nullable', 'string'],
            'service_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        return response()->json(['data' => $this->workspace->prestationRows($this->employeeOrFail($request), $filters)]);
    }

    public function commissions(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'status' => ['nullable', 'string'],
            'range' => ['nullable', 'in:7d,month,3m,6m,year'],
        ]);

        return response()->json(['data' => $this->workspace->commissions($this->employeeOrFail($request), $filters)]);
    }

    public function statistics(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'period' => ['nullable', 'in:7d,month,3m,6m,year,custom'],
            'range' => ['nullable', 'in:7d,month,3m,6m,year'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        return response()->json(['data' => $this->workspace->statistics($this->employeeOrFail($request), $filters)]);
    }

    public function agenda(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'view' => ['nullable', 'in:today,day,week,month,list'],
        ]);

        $view = $validated['view'] ?? 'today';
        $from = ! empty($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : now()->startOfDay();
        $to = ! empty($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : match ($view) {
            'week' => $from->copy()->endOfWeek(),
            'month' => $from->copy()->endOfMonth(),
            default => $from->copy()->endOfDay(),
        };

        return response()->json(['data' => $this->workspace->agenda($this->employeeOrFail($request), $from, $to)]);
    }

    public function appointment(Request $request, Appointment $appointment): JsonResponse
    {
        return response()->json(['data' => $this->workspace->appointment($this->employeeOrFail($request), $appointment)]);
    }

    public function clients(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->workspace->clients($this->employeeOrFail($request))]);
    }

    public function reviews(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->workspace->reviews($this->employeeOrFail($request))]);
    }

    public function documents(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->workspace->documents($this->employeeOrFail($request))]);
    }

    public function supportIndex(Request $request): JsonResponse
    {
        $employee = $this->employeeOrFail($request);
        $conversations = EmployeeSupportConversation::where('employee_id', $employee->id)
            ->with('messages.user')
            ->orderByDesc('last_message_at')
            ->get()
            ->map(fn (EmployeeSupportConversation $conversation) => $this->supportSummary($conversation))
            ->all();

        return response()->json(['data' => $conversations]);
    }

    public function supportStore(Request $request): JsonResponse
    {
        $employee = $this->employeeOrFail($request);
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'max:80'],
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $conversation = EmployeeSupportConversation::create([
            'employee_id' => $employee->id,
            'subject' => $validated['subject'],
            'category' => $validated['category'] ?? null,
            'status' => EmployeeSupportConversation::STATUS_NEW,
            'employee_last_read_at' => now(),
            'last_message_at' => now(),
        ]);

        EmployeeSupportMessage::create([
            'conversation_id' => $conversation->id,
            'user_id' => $request->user()->id,
            'body' => $validated['body'],
        ]);

        return response()->json(['data' => $this->supportDetail($conversation->fresh('messages.user'))], 201);
    }

    public function supportShow(Request $request, EmployeeSupportConversation $conversation): JsonResponse
    {
        $this->assertSupportOwner($request, $conversation);
        $conversation->update(['employee_last_read_at' => now()]);

        return response()->json(['data' => $this->supportDetail($conversation->fresh('messages.user'))]);
    }

    public function supportMessage(Request $request, EmployeeSupportConversation $conversation): JsonResponse
    {
        $this->assertSupportOwner($request, $conversation);
        $validated = $request->validate(['body' => ['required', 'string', 'max:4000']]);

        EmployeeSupportMessage::create([
            'conversation_id' => $conversation->id,
            'user_id' => $request->user()->id,
            'body' => $validated['body'],
        ]);

        $conversation->update([
            'status' => EmployeeSupportConversation::STATUS_IN_PROGRESS,
            'employee_last_read_at' => now(),
            'last_message_at' => now(),
        ]);

        return response()->json(['data' => $this->supportDetail($conversation->fresh('messages.user'))]);
    }

    private function supportSummary(EmployeeSupportConversation $conversation): array
    {
        $lastMessage = $conversation->messages->last();

        return [
            'id' => $conversation->id,
            'subject' => $conversation->subject,
            'category' => $conversation->category,
            'status' => $conversation->status,
            'last_message_at' => $conversation->last_message_at?->toIso8601String(),
            'last_message_preview' => $lastMessage ? str($lastMessage->body)->limit(90)->toString() : null,
        ];
    }

    private function supportDetail(EmployeeSupportConversation $conversation): array
    {
        return [
            ...$this->supportSummary($conversation),
            'messages' => $conversation->messages->map(fn (EmployeeSupportMessage $message) => [
                'id' => $message->id,
                'body' => $message->body,
                'author_name' => $message->user?->name,
                'is_mine' => $message->user_id === request()->user()?->id,
                'created_at' => $message->created_at?->toIso8601String(),
            ])->all(),
        ];
    }

    private function assertSupportOwner(Request $request, EmployeeSupportConversation $conversation): void
    {
        abort_unless($conversation->employee_id === $this->employeeOrFail($request)->id, 403, 'Cette conversation ne vous appartient pas.');
    }

    private function employeeOrFail(Request $request): Employee
    {
        $employee = $request->user()->employee;

        abort_if($employee === null, 403, 'Votre compte n est lie a aucune fiche employe.');

        return $employee;
    }
}
