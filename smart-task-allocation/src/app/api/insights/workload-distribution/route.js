import { NextResponse } from "next/server";
import { getRequesterOrganizationId, isPlatformAdminRole, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// A person's current load only counts against them while it's still open
// work — once a task is Completed or Archived it's no longer something
// they're carrying, so it drops out of the snapshot.
const INACTIVE_STATUSES = new Set(["completed", "archived"]);

const DEFAULT_WORKLOAD_TASK_LIMIT = 8;

// Overloaded is a hard admin-set ceiling (organization.workload_task_limit —
// see Workload Policy in Settings); underloaded stays relative to the
// team's own current average, since there's no meaningful absolute "too
// few tasks" number the way there is for "too many."
const UNDERLOADED_MULTIPLIER = 0.6;

function statusFor(count, average, limit) {
  if (count > limit) return "overloaded";
  if (average > 0 && count < average * UNDERLOADED_MULTIPLIER) return "underloaded";
  return "balanced";
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);

    if (!organizationId) {
      return NextResponse.json({ members: [], average: 0, limit: DEFAULT_WORKLOAD_TASK_LIMIT });
    }

    const [
      { data: tasks, error: tasksError },
      { data: organization, error: organizationError },
      { data: accounts, error: accountsError },
    ] = await Promise.all([
      supabase.from("task").select("task_id, status, assigned_to").eq("organization_id", organizationId),
      supabase.from("organization").select("workload_task_limit").eq("organization_id", organizationId).maybeSingle(),
      supabase
        .from("user_account")
        .select("user_id, account_status, role:role_id(role_name)")
        .eq("organization_id", organizationId),
    ]);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }
    if (organizationError) {
      return NextResponse.json({ error: organizationError.message }, { status: 400 });
    }
    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 400 });
    }

    const limit = organization?.workload_task_limit ?? DEFAULT_WORKLOAD_TASK_LIMIT;

    // The full roster this chart should account for — active members who
    // could actually be carrying work, including anyone with zero tasks
    // right now (they're the clearest Underloaded case there is).
    const rosterUserIds = (accounts ?? [])
      .filter((account) => account.account_status === "Active" && !isPlatformAdminRole(account.role?.role_name))
      .map((account) => account.user_id);

    const activeTasks = (tasks ?? []).filter(
      (task) => !INACTIVE_STATUSES.has(String(task.status || "").toLowerCase()),
    );
    const taskIds = activeTasks.map((task) => task.task_id);

    // Multi-assignee join table is the source of truth; assigned_to is only
    // a fallback mirror for tasks that predate/skip it (same pattern as
    // /api/employee-tasks).
    let assigneeIdsByTaskId = new Map();
    if (taskIds.length) {
      const { data: assigneeRows, error: assigneeError } = await supabase
        .from("task_assignee")
        .select("task_id, user_id")
        .in("task_id", taskIds);

      if (assigneeError) {
        return NextResponse.json({ error: assigneeError.message }, { status: 400 });
      }

      for (const row of assigneeRows ?? []) {
        const list = assigneeIdsByTaskId.get(row.task_id) ?? [];
        list.push(row.user_id);
        assigneeIdsByTaskId.set(row.task_id, list);
      }
    }

    const countByUserId = new Map();
    for (const task of activeTasks) {
      const assigneeIds = assigneeIdsByTaskId.get(task.task_id) ?? (task.assigned_to ? [task.assigned_to] : []);
      for (const userId of assigneeIds) {
        countByUserId.set(userId, (countByUserId.get(userId) ?? 0) + 1);
      }
    }

    // Union with anyone in countByUserId who fell outside the roster filter
    // (e.g. a since-suspended account still holding an active assignment) —
    // their load shouldn't silently vanish from the chart either.
    const memberIds = new Set([...rosterUserIds, ...countByUserId.keys()]);

    if (!memberIds.size) {
      return NextResponse.json({ members: [], average: 0, limit });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profile")
      .select("user_id, full_name")
      .in("user_id", [...memberIds]);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    const nameByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name]));
    const counts = [...memberIds].map((userId) => countByUserId.get(userId) ?? 0);
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;

    const members = [...memberIds]
      .map((userId) => {
        const count = countByUserId.get(userId) ?? 0;
        return {
          userId,
          name: nameByUserId.get(userId) || "Unknown",
          count,
          status: statusFor(count, average, limit),
        };
      })
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ members, average, limit });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
