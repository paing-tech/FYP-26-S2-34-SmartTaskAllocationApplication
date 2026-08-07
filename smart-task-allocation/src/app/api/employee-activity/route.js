import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getAccount(supabase, user) {
  const { data, error } = await supabase
    .from("user_account")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

// The Employee workspace's "Task History" — unlike the manager's Allocation
// History (who was assigned what by whom, org-wide), this is scoped to only
// the signed-in employee's own history: tasks they marked Completed, and
// tasks assigned to them.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError || !account) {
      return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 400 });
    }

    const [{ data: statusRows, error: statusError }, { data: assignmentRows, error: assignmentError }] =
      await Promise.all([
        supabase
          .from("task_history")
          .select("task_history_id, task_id, from_status, to_status, changed_at, task:task_id(title)")
          .eq("user_id", account.user_id)
          .order("changed_at", { ascending: false })
          .limit(50),
        supabase
          .from("task_assignment")
          .select("assignment_id, task_id, assigned_by, assigned_at")
          .eq("user_id", account.user_id)
          .order("assigned_at", { ascending: false })
          .limit(50),
      ]);

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 400 });
    }

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }

    // task_assignment has no foreign-key constraint to task (unlike
    // task_history), so PostgREST can't embed `task:task_id(title)` for it —
    // resolve titles with a plain follow-up query instead.
    const assignmentTaskIds = [...new Set((assignmentRows ?? []).map((row) => row.task_id))];
    let assignmentTaskTitleById = new Map();

    if (assignmentTaskIds.length) {
      const { data: assignmentTasks } = await supabase
        .from("task")
        .select("task_id, title")
        .in("task_id", assignmentTaskIds);
      assignmentTaskTitleById = new Map((assignmentTasks ?? []).map((row) => [row.task_id, row.title]));
    }

    const statusEvents = (statusRows ?? []).map((row) => ({
      type: "status_change",
      id: `status-${row.task_history_id}`,
      taskId: row.task_id,
      taskTitle: row.task?.title ?? "Task",
      fromStatus: row.from_status,
      toStatus: row.to_status,
      occurredAt: row.changed_at,
    }));

    const assignmentEvents = (assignmentRows ?? []).map((row) => ({
      type: "assignment",
      id: `assignment-${row.assignment_id}`,
      taskId: row.task_id,
      taskTitle: assignmentTaskTitleById.get(row.task_id) ?? "Task",
      assignedBy: row.assigned_by || "Manager",
      occurredAt: row.assigned_at,
    }));

    const activity = [...statusEvents, ...assignmentEvents].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return NextResponse.json({ activity });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
