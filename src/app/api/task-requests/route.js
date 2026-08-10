import { NextResponse } from "next/server";
import { requireManagerOrEmployee } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getAccount(supabase, user) {
  const columns = "user_id, organization_id, username, email";
  const byId = await supabase.from("user_account").select(columns).eq("user_id", user.id).maybeSingle();
  if (byId.data || !user.email) return byId;
  return supabase.from("user_account").select(columns).eq("email", user.email).maybeSingle();
}

function overlaps(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

async function enrichTasks(supabase, tasks) {
  const taskIds = tasks.map((task) => task.task_id);
  if (!taskIds.length) return tasks;
  const { data: skillRows } = await supabase
    .from("task_skill")
    .select("task_id, skill_id, skill:skill_id(skill_name)")
    .in("task_id", taskIds);
  const skillsByTask = new Map();
  for (const row of skillRows ?? []) {
    const list = skillsByTask.get(row.task_id) ?? [];
    list.push({ skill_id: row.skill_id, skill_name: row.skill?.skill_name });
    skillsByTask.set(row.task_id, list);
  }
  return tasks.map((task) => ({ ...task, requiredSkills: skillsByTask.get(task.task_id) ?? [] }));
}

async function checkEligibility(supabase, task, userId) {
  if (!task || String(task.status).toLowerCase() !== "open") {
    return { eligible: false, reason: "This task is closed or no longer accepting requests." };
  }

  const { data: currentAssignee } = await supabase
    .from("task_assignee")
    .select("user_id")
    .eq("task_id", task.task_id)
    .limit(1)
    .maybeSingle();
  if (task.assigned_to || currentAssignee) {
    return { eligible: false, reason: "This task is already fully allocated." };
  }

  const [{ data: required }, { data: employeeSkills }] = await Promise.all([
    supabase.from("task_skill").select("skill_id, skill:skill_id(skill_name)").eq("task_id", task.task_id),
    supabase.from("user_skill").select("skill_id").eq("user_id", userId),
  ]);
  const employeeSkillIds = new Set((employeeSkills ?? []).map((row) => String(row.skill_id)));
  const missingSkills = (required ?? []).filter((row) => !employeeSkillIds.has(String(row.skill_id)));
  if (missingSkills.length) {
    return {
      eligible: false,
      reason: `Missing required skill: ${missingSkills.map((row) => row.skill?.skill_name || row.skill_id).join(", ")}.`,
    };
  }

  if (task.start_datetime && task.end_datetime) {
    const { data: availabilityRows } = await supabase
      .from("availability")
      .select("status, availability_start, availability_end")
      .eq("user_id", userId);
    if ((availabilityRows ?? []).length) {
      const available = availabilityRows.some((row) =>
        String(row.status).toLowerCase() === "available" &&
        new Date(row.availability_start) <= new Date(task.start_datetime) &&
        new Date(row.availability_end) >= new Date(task.end_datetime),
      );
      if (!available) {
        return { eligible: false, reason: "You are unavailable during the task period." };
      }
    }

    const { data: assignedRows } = await supabase
      .from("task_assignee")
      .select("task_id")
      .eq("user_id", userId);
    const assignedIds = (assignedRows ?? []).map((row) => row.task_id).filter((id) => id !== task.task_id);
    if (assignedIds.length) {
      const { data: assignedTasks } = await supabase
        .from("task")
        .select("task_id, title, status, start_datetime, end_datetime")
        .in("task_id", assignedIds);
      const conflict = (assignedTasks ?? []).find((candidate) =>
        !["completed", "cancelled", "archived"].includes(String(candidate.status).toLowerCase()) &&
        overlaps(task.start_datetime, task.end_datetime, candidate.start_datetime, candidate.end_datetime),
      );
      if (conflict) {
        return { eligible: false, reason: `Scheduling conflict with ${conflict.title}.` };
      }
    }
  }

  return { eligible: true, reason: "Eligible" };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, homeRoute, error: authError } = await requireManagerOrEmployee(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const { data: account, error: accountError } = await getAccount(supabase, user);
    if (accountError || !account) return NextResponse.json({ error: accountError?.message || "Account not found." }, { status: 404 });

    const { data: requestRows, error: requestError } = await supabase
      .from("task_assignment_request")
      .select("request_id, task_id, user_id, requested_at, status")
      .order("requested_at", { ascending: false });
    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 400 });

    const taskIds = [...new Set((requestRows ?? []).map((row) => row.task_id))];
    let requestedTasks = [];
    if (taskIds.length) {
      const { data } = await supabase.from("task").select("*").in("task_id", taskIds).eq("organization_id", account.organization_id);
      requestedTasks = await enrichTasks(supabase, data ?? []);
    }
    const taskById = new Map(requestedTasks.map((task) => [task.task_id, task]));

    if (homeRoute === "/manager") {
      const orgRequests = (requestRows ?? []).filter((row) => taskById.has(row.task_id));
      const userIds = [...new Set(orgRequests.map((row) => row.user_id))];
      const { data: users } = userIds.length
        ? await supabase.from("user_account").select("user_id, username, email").in("user_id", userIds)
        : { data: [] };
      const userById = new Map((users ?? []).map((row) => [row.user_id, row]));
      return NextResponse.json({
        requests: orgRequests.map((row) => ({ ...row, task: taskById.get(row.task_id), employee: userById.get(row.user_id) })),
      });
    }

    const myRequests = (requestRows ?? [])
      .filter((row) => row.user_id === account.user_id && taskById.has(row.task_id))
      .map((row) => ({ ...row, task: taskById.get(row.task_id) }));

    const { data: openTasks, error: openError } = await supabase
      .from("task")
      .select("*")
      .eq("organization_id", account.organization_id)
      .eq("status", "Open")
      .is("assigned_to", null)
      .order("start_datetime", { ascending: true });
    if (openError) return NextResponse.json({ error: openError.message }, { status: 400 });

    const openTaskIds = (openTasks ?? []).map((task) => task.task_id);
    const { data: occupied } = openTaskIds.length
      ? await supabase.from("task_assignee").select("task_id").in("task_id", openTaskIds)
      : { data: [] };
    const occupiedIds = new Set((occupied ?? []).map((row) => row.task_id));
    const availableTasks = await enrichTasks(supabase, (openTasks ?? []).filter((task) => !occupiedIds.has(task.task_id)));

    return NextResponse.json({ availableTasks, requests: myRequests });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, homeRoute, error: authError } = await requireManagerOrEmployee(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (homeRoute === "/manager") return NextResponse.json({ error: "Managers cannot create employee requests." }, { status: 403 });

    const { data: account } = await getAccount(supabase, user);
    const { taskId } = await request.json();
    if (!account || !taskId) return NextResponse.json({ error: "Employee account and task are required." }, { status: 400 });

    const { data: task } = await supabase.from("task").select("*").eq("task_id", taskId).eq("organization_id", account.organization_id).maybeSingle();
    const eligibility = await checkEligibility(supabase, task, account.user_id);
    if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 400 });

    const { data: existing } = await supabase
      .from("task_assignment_request")
      .select("request_id, status")
      .eq("task_id", taskId)
      .eq("user_id", account.user_id)
      .neq("status", "Cancelled")
      .maybeSingle();
    if (existing) return NextResponse.json({ error: `A request already exists with status ${existing.status}.` }, { status: 400 });

    const requestedAt = new Date().toISOString();
    const { data: created, error } = await supabase
      .from("task_assignment_request")
      .insert({ task_id: taskId, user_id: account.user_id, requested_at: requestedAt, status: "Pending" })
      .select("request_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.from("activity_log").insert({ user_id: account.user_id, action: "Task Assignment Requested", details: JSON.stringify({ requestId: created.request_id, taskId, status: "Pending" }), created_at: requestedAt });
    return NextResponse.json({ success: true, requestId: created.request_id, status: "Pending", requestedAt });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, homeRoute, error: authError } = await requireManagerOrEmployee(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const { requestId, status, reason } = await request.json();
    if (!requestId || !["Approved", "Rejected", "Cancelled"].includes(status)) return NextResponse.json({ error: "A request and valid status are required." }, { status: 400 });

    const { data: account } = await getAccount(supabase, user);
    const { data: row } = await supabase.from("task_assignment_request").select("*").eq("request_id", requestId).maybeSingle();
    if (!row) return NextResponse.json({ error: "Task request not found." }, { status: 404 });

    const { data: task } = await supabase.from("task").select("*").eq("task_id", row.task_id).maybeSingle();
    if (!task || task.organization_id !== account?.organization_id) return NextResponse.json({ error: "Task request not found in your organization." }, { status: 404 });

    if (status === "Cancelled") {
      if (homeRoute === "/manager" || row.user_id !== account.user_id) return NextResponse.json({ error: "This request does not belong to the current employee." }, { status: 403 });
      if (row.status !== "Pending") return NextResponse.json({ error: `A ${row.status} request cannot be cancelled.` }, { status: 400 });
    } else {
      if (homeRoute !== "/manager") return NextResponse.json({ error: "Only Managers can approve or reject requests." }, { status: 403 });
      if (row.status !== "Pending") return NextResponse.json({ error: `This request is already ${row.status}.` }, { status: 400 });
      if (status === "Approved") {
        const eligibility = await checkEligibility(supabase, task, row.user_id);
        if (!eligibility.eligible) return NextResponse.json({ error: `Approval blocked: ${eligibility.reason}` }, { status: 400 });
        const now = new Date().toISOString();
        const { error: assigneeError } = await supabase.from("task_assignee").insert({ task_id: row.task_id, user_id: row.user_id });
        if (assigneeError) return NextResponse.json({ error: assigneeError.message }, { status: 400 });
        await supabase.from("task").update({ assigned_to: row.user_id, updated_at: now }).eq("task_id", row.task_id);
        await supabase.from("task_assignment").insert({ task_id: row.task_id, user_id: row.user_id, assigned_at: now, assigned_by: account.username || "Manager", status: "Assigned" });
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("task_assignment_request").update({ status }).eq("request_id", requestId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    await supabase.from("activity_log").insert({ user_id: user.id, action: "Task Request Status Updated", details: JSON.stringify({ requestId, taskId: row.task_id, status, reason: String(reason || "").trim() || null }), created_at: now });
    return NextResponse.json({ success: true, status, updatedAt: now });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
