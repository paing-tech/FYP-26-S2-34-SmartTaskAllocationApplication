import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getAccount(supabase, user) {
  const { data, error } = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || data) {
    return { account: data, error };
  }

  const byEmail = await supabase
    .from("user_account")
    .select("user_id, organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return { account: byEmail.data, error: byEmail.error };
}

// GET returns only tasks assigned to the signed-in employee — the same
// board-column/task-card shape WorkspaceBoard already expects (raw task
// columns + requiredSkills + assigneeIds), scoped down from the manager's
// full-org /api/tasks rather than reusing it (that route is manager-only).
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account?.organization_id) {
      return NextResponse.json({ tasks: [], completedTasks: [], groups: [], employees: [] });
    }

    // "Assigned to me" means either the single-assignee mirror column or a
    // row in the multi-assignee join table.
    const { data: assigneeRows, error: assigneeRowsError } = await supabase
      .from("task_assignee")
      .select("task_id")
      .eq("user_id", account.user_id);

    if (assigneeRowsError) {
      return NextResponse.json({ error: assigneeRowsError.message }, { status: 400 });
    }

    const assignedTaskIds = new Set((assigneeRows ?? []).map((row) => row.task_id));

    const { data: allTasks, error: tasksError } = await supabase
      .from("task")
      .select("*")
      .eq("organization_id", account.organization_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    // Completed tasks move to Task History (see /api/employee-activity) —
    // once marked done, they no longer clutter the active board, but are
    // still returned separately (completedTasks) so Task History can show
    // them as full task cards.
    const myTasksAll = (allTasks ?? []).filter((task) => {
      const status = String(task.status || "").toLowerCase();
      return (task.assigned_to === account.user_id || assignedTaskIds.has(task.task_id)) && status !== "archived";
    });

    const taskIds = myTasksAll.map((task) => task.task_id);
    const requiredSkillsByTaskId = new Map();
    const assigneeIdsByTaskId = new Map();
    const commentCountByTaskId = new Map();

    if (taskIds.length) {
      const [{ data: skillRows }, { data: assigneeAllRows }, { data: commentRows }] = await Promise.all([
        supabase
          .from("task_skill")
          .select("task_id, skill_id, skill:skill_id(skill_name)")
          .in("task_id", taskIds),
        supabase.from("task_assignee").select("task_id, user_id").in("task_id", taskIds),
        supabase.from("task_comment").select("task_id").in("task_id", taskIds),
      ]);

      for (const row of skillRows ?? []) {
        const list = requiredSkillsByTaskId.get(row.task_id) ?? [];
        list.push({ skill_id: row.skill_id, skill_name: row.skill?.skill_name });
        requiredSkillsByTaskId.set(row.task_id, list);
      }

      for (const row of assigneeAllRows ?? []) {
        const list = assigneeIdsByTaskId.get(row.task_id) ?? [];
        list.push(row.user_id);
        assigneeIdsByTaskId.set(row.task_id, list);
      }

      for (const row of commentRows ?? []) {
        commentCountByTaskId.set(row.task_id, (commentCountByTaskId.get(row.task_id) ?? 0) + 1);
      }
    }

    function enrichTask(task) {
      return {
        ...task,
        requiredSkills: requiredSkillsByTaskId.get(task.task_id) ?? [],
        assigneeIds: assigneeIdsByTaskId.get(task.task_id) ?? (task.assigned_to ? [task.assigned_to] : []),
        comment_count: commentCountByTaskId.get(task.task_id) ?? 0,
      };
    }

    const tasks = myTasksAll
      .filter((task) => String(task.status || "").toLowerCase() !== "completed")
      .map(enrichTask);
    const completedTasks = myTasksAll
      .filter((task) => String(task.status || "").toLowerCase() === "completed")
      .map(enrichTask);

    // Only the columns these tasks actually land in — the employee board
    // never creates/renames/deletes groups, so there's no need for the
    // org's full group list.
    const groupIds = [...new Set(tasks.map((task) => task.group_id).filter(Boolean))];
    let groups = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from("task_group")
        .select("group_id, group_name, sort_order")
        .in("group_id", groupIds)
        .order("sort_order", { ascending: true });
      groups = data ?? [];
    }

    // Profile info for whoever the board needs to render an avatar/name for
    // — task owners and every assignee (usually just this employee, but a
    // co-assigned task may reference others), across both active and
    // completed tasks.
    const peopleIds = [
      ...new Set(
        [...tasks, ...completedTasks]
          .flatMap((task) => [task.owner_id, ...(task.assigneeIds ?? [])])
          .filter(Boolean),
      ),
    ];
    let employees = [];
    if (peopleIds.length) {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase
          .from("profile")
          .select("user_id, full_name, job_title, profile_picture_url")
          .in("user_id", peopleIds),
        supabase
          .from("user_account")
          .select("user_id, username, email, department:department_id(department_name), role:role_id(role_name)")
          .in("user_id", peopleIds),
      ]);
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      const accountMap = new Map((accounts ?? []).map((row) => [row.user_id, row]));

      employees = peopleIds.map((id) => ({
        user_id: id,
        full_name: profileMap.get(id)?.full_name ?? null,
        job_title: profileMap.get(id)?.job_title ?? null,
        avatar_url: profileMap.get(id)?.profile_picture_url ?? null,
        username: accountMap.get(id)?.username ?? null,
        email: accountMap.get(id)?.email ?? null,
        department: accountMap.get(id)?.department ?? null,
        role: accountMap.get(id)?.role ?? null,
      }));
    }

    return NextResponse.json({ tasks, completedTasks, groups, employees });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// The employee board's mutations: start, complete, or reopen one of their
// own assigned tasks. Anything else
// (reassigning, editing details, deleting) stays manager-only.
export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireEmployee(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { account, error: accountError } = await getAccount(supabase, user);

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { action, taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabase
      .from("task")
      .select("task_id, status, assigned_to, organization_id")
      .eq("task_id", taskId)
      .maybeSingle();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 400 });
    }

    if (!task || task.organization_id !== account.organization_id) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: assigneeRow } = await supabase
      .from("task_assignee")
      .select("task_id")
      .eq("task_id", taskId)
      .eq("user_id", account.user_id)
      .maybeSingle();

    const isAssignedToMe = task.assigned_to === account.user_id || Boolean(assigneeRow);

    if (!isAssignedToMe) {
      return NextResponse.json({ error: "You can only update tasks assigned to you." }, { status: 403 });
    }

    const fromStatus = task.status;
    const toStatus = action === "reopen" ? "Open" : action === "start" ? "In Progress" : "Completed";

    if (action === "reopen" && fromStatus !== "Completed") {
      return NextResponse.json({ error: "Only completed tasks can be reopened." }, { status: 400 });
    }

    if (action === "start" && !["Open", "Assigned", "Not Started"].includes(fromStatus)) {
      return NextResponse.json({ error: "Only a not-started task can be moved to In Progress." }, { status: 400 });
    }

    if (fromStatus === toStatus) {
      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabase
      .from("task")
      .update({ status: toStatus, updated_at: new Date().toISOString() })
      .eq("task_id", taskId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Best-effort: the task's status is already updated above, so a failure
    // here shouldn't block that — but it must not be swallowed silently
    // either, since this is the only place Task History gets its data from.
    const { error: historyError } = await supabase.from("task_history").insert({
      task_id: taskId,
      user_id: account.user_id,
      from_status: fromStatus,
      to_status: toStatus,
    });

    if (historyError) {
      console.error("Failed to record task_history:", historyError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
