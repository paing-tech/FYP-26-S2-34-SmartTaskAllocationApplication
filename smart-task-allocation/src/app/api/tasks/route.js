import { NextResponse } from "next/server";
import { getAuthenticatedUser, requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTaskOrder(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((task, index) => ({
      taskId: task?.taskId,
      sortOrder: Number.isFinite(Number(task?.sortOrder)) ? Number(task.sortOrder) : index,
    }))
    .filter((task) => task.taskId);
}

async function getManagerOrganizationId(supabase, user) {
  const { data } = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data?.organization_id) {
    return data.organization_id;
  }

  const byEmail = await supabase
    .from("user_account")
    .select("organization_id")
    .eq("email", user.email)
    .maybeSingle();

  return byEmail.data?.organization_id ?? null;
}

// Display name of the person performing the assignment (the manager).
async function getActorName(supabase, user) {
  const { data: profile } = await supabase
    .from("profile")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.full_name) return profile.full_name;

  const { data: account } = await supabase
    .from("user_account")
    .select("username, email")
    .eq("user_id", user.id)
    .maybeSingle();
  return account?.username || account?.email || "Manager";
}

// Record a task → employee assignment in the allocation history.
async function recordAssignment(supabase, { taskId, userId, assignedBy }) {
  if (!taskId || !userId) return;
  await supabase.from("task_assignment").insert({
    task_id: taskId,
    user_id: userId,
    assigned_by: assignedBy || "Manager",
    assigned_at: new Date().toISOString(),
    status: "Assigned",
  });
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    let query = supabase
      .from("task")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const taskIds = (data ?? []).map((task) => task.task_id).filter(Boolean);
    let latestAssignmentByTaskId = new Map();

    if (taskIds.length) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("task_assignment")
        .select("task_id, assigned_by, assigned_at")
        .in("task_id", taskIds)
        .order("assigned_at", { ascending: false });

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 400 });
      }

      for (const assignment of assignments ?? []) {
        if (!latestAssignmentByTaskId.has(assignment.task_id)) {
          latestAssignmentByTaskId.set(assignment.task_id, assignment);
        }
      }
    }

    const tasks = (data ?? []).map((task) => {
      const latestAssignment = latestAssignmentByTaskId.get(task.task_id);

      return {
        ...task,
        latest_assigned_by: latestAssignment?.assigned_by ?? null,
        latest_assigned_at: latestAssignment?.assigned_at ?? null,
      };
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const managerCheck = await requireManager(request, supabase);

    if (managerCheck.error) {
      return NextResponse.json({ error: managerCheck.error }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    const {
      workspaceId,
      groupId,
      title,
      description,
      assignedTo,
      assignedBy,
      status,
      priority,
      startDatetime,
      endDatetime,
    } = await request.json();

    if (!cleanString(title)) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID is required." }, { status: 400 });
    }

    const { data: lastTask } = await supabase
      .from("task")
      .select("sort_order")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = Number.isFinite(Number(lastTask?.sort_order))
      ? Number(lastTask.sort_order) + 1
      : 0;

    const { data: createdTask, error } = await supabase
      .from("task")
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        group_id: groupId ?? null,
        title: cleanString(title),
        description: cleanString(description) || null,
        owner_id: user.id,
        assigned_to: assignedTo || null,
        status: cleanString(status) || "Open",
        priority: cleanString(priority) || "Medium",
        start_datetime: startDatetime || null,
        end_datetime: endDatetime || null,
        sort_order: nextSortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("task_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (assignedTo) {
      const actor = assignedBy || (await getActorName(supabase, user));
      await recordAssignment(supabase, {
        taskId: createdTask.task_id,
        userId: assignedTo,
        assignedBy: actor,
      });
    }

    return NextResponse.json({ success: true, task: createdTask });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const {
      action,
      workspaceId,
      tasks,
      taskId,
      groupId,
      title,
      description,
      assignedTo,
      assignedBy,
      status,
      priority,
      startDatetime,
      endDatetime,
    } = body;

    if (action === "move") {
      if (!taskId) {
        return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
      }

      const { error: moveError } = await supabase
        .from("task")
        .update({ group_id: groupId ?? null, updated_at: new Date().toISOString() })
        .eq("task_id", taskId);

      if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "reorder") {
      const orderedTasks = normalizeTaskOrder(tasks);

      if (!workspaceId) {
        return NextResponse.json({ error: "Workspace ID is required." }, { status: 400 });
      }

      if (!orderedTasks.length) {
        return NextResponse.json({ error: "Tasks are required." }, { status: 400 });
      }

      const organizationId = await getManagerOrganizationId(supabase, user);
      const updates = orderedTasks.map((task) =>
        supabase
          .from("task")
          .update({
            sort_order: task.sortOrder,
            updated_at: new Date().toISOString(),
          })
          .eq("task_id", task.taskId)
          .eq("workspace_id", workspaceId)
          .eq("organization_id", organizationId)
      );
      const results = await Promise.all(updates);
      const failedUpdate = results.find((result) => result.error);

      if (failedUpdate?.error) {
        return NextResponse.json({ error: failedUpdate.error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    const taskUpdates = {
      title: cleanString(title),
      description: cleanString(description) || null,
      assigned_to: assignedTo || null,
      status: cleanString(status) || "Open",
      priority: cleanString(priority) || "Medium",
      start_datetime: startDatetime || null,
      end_datetime: endDatetime || null,
      updated_at: new Date().toISOString(),
    };
    // Only change the group when explicitly provided (move between groups).
    if (groupId !== undefined) {
      taskUpdates.group_id = groupId;
    }

    // Detect a real assignment change so we can log it in the allocation history.
    const { data: existingTask } = await supabase
      .from("task")
      .select("assigned_to")
      .eq("task_id", taskId)
      .maybeSingle();

    const { error } = await supabase.from("task").update(taskUpdates).eq("task_id", taskId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (assignedTo && assignedTo !== existingTask?.assigned_to) {
      const actor = assignedBy || (await getActorName(supabase, user));
      await recordAssignment(supabase, { taskId, userId: assignedTo, assignedBy: actor });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const { error } = await supabase.from("task").delete().eq("task_id", taskId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
