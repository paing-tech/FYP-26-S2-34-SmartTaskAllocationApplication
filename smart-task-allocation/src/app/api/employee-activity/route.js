import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// The Employee workspace's "Activity Log" — unlike the manager's Allocation
// History (who was assigned what by whom, org-wide), this is scoped to only
// the signed-in employee's own actions (status changes they made).
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data: rows, error } = await supabase
      .from("task_status_history")
      .select("task_status_history_id, task_id, from_status, to_status, changed_at, task:task_id(title)")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const activity = (rows ?? []).map((row) => ({
      id: row.task_status_history_id,
      taskId: row.task_id,
      taskTitle: row.task?.title ?? "Task",
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: row.changed_at,
    }));

    return NextResponse.json({ activity });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
