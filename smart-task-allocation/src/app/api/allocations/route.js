import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getManagerOrganizationId(supabase, user) {
  const { data } = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.organization_id) return data.organization_id;

  const byEmail = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("email", user.email)
    .maybeSingle();
  return byEmail.data?.organization_id ?? null;
}

// Task allocation history for the manager's organization.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    if (!organizationId) {
      return NextResponse.json({ allocations: [] });
    }

    // Tasks in this org -> map of task_id to its reusable task details.
    const { data: tasks } = await supabase
      .from("task")
      .select(
        "task_id, title, description, group_id, status, priority, start_datetime, end_datetime, source, ai_state, reasons",
      )
      .eq("organization_id", organizationId);
    const taskById = new Map((tasks ?? []).map((t) => [t.task_id, t]));
    const taskIds = (tasks ?? []).map((t) => t.task_id);

    if (!taskIds.length) {
      return NextResponse.json({ allocations: [] });
    }

    const [
      { data: assignments, error },
      { data: skillRows, error: skillError },
    ] = await Promise.all([
      supabase
        .from("task_assignment")
        .select("assignment_id, task_id, user_id, assigned_at, status, assigned_by")
        .in("task_id", taskIds)
        .order("assigned_at", { ascending: false }),
      supabase.from("task_skill").select("task_id, skill_id").in("task_id", taskIds),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (skillError) {
      return NextResponse.json({ error: skillError.message }, { status: 400 });
    }

    const skillIdsByTaskId = new Map();
    for (const row of skillRows ?? []) {
      const list = skillIdsByTaskId.get(row.task_id) ?? [];
      list.push(row.skill_id);
      skillIdsByTaskId.set(row.task_id, list);
    }

    const userIds = [...new Set((assignments ?? []).map((a) => a.user_id).filter(Boolean))];
    let nameByUser = new Map();
    if (userIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
        supabase.from("user_account").select("user_id, username").in("user_id", userIds),
      ]);
      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
      const accountMap = new Map((accounts ?? []).map((a) => [a.user_id, a.username]));
      nameByUser = new Map(
        userIds.map((id) => [id, profileMap.get(id) || accountMap.get(id) || "Unknown"]),
      );
    }

    const allocations = (assignments ?? []).map((assignment) => {
      const task = taskById.get(assignment.task_id);
      return {
        id: assignment.assignment_id,
        taskId: assignment.task_id,
        taskTitle: task?.title ?? "Task",
        taskDescription: task?.description ?? "",
        groupId: task?.group_id ?? null,
        taskStatus: task?.status ?? "Open",
        priority: task?.priority ?? "Medium",
        startDatetime: task?.start_datetime ?? null,
        endDatetime: task?.end_datetime ?? null,
        source: task?.source ?? "manual",
        aiState: task?.ai_state ?? null,
        reasons: task?.reasons ?? null,
        requiredSkillIds: skillIdsByTaskId.get(assignment.task_id) ?? [],
        assigneeUserId: assignment.user_id,
        assigneeName: nameByUser.get(assignment.user_id) ?? "Unknown",
        assignedBy: assignment.assigned_by ?? "Manager",
        assignedAt: assignment.assigned_at,
        status: assignment.status,
      };
    });

    return NextResponse.json({ allocations });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
