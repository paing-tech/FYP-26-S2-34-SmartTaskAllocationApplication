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

// Replace a task's required-skill set. Deletes existing rows first so this is
// idempotent regardless of what was there before.
async function syncTaskSkills(supabase, taskId, skillIds) {
  const { error: deleteError } = await supabase.from("task_skill").delete().eq("task_id", taskId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const uniqueIds = [...new Set((skillIds ?? []).map(Number).filter(Number.isFinite))];

  if (!uniqueIds.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from("task_skill")
    .insert(uniqueIds.map((skillId) => ({ task_id: taskId, skill_id: skillId })));

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function ensureNewTaskGroup(supabase, organizationId) {
  const { data: existingGroups, error: groupError } = await supabase
    .from("task_group")
    .select("group_id, group_name, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (groupError) {
    throw new Error(groupError.message);
  }

  const existingNewGroup = (existingGroups ?? []).find(
    (group) => cleanString(group.group_name).toLowerCase() === "new",
  );

  if (existingNewGroup) {
    return existingNewGroup.group_id;
  }

  const lastSortOrder = (existingGroups ?? []).reduce((maxOrder, group) => {
    const sortOrder = Number(group.sort_order);
    return Number.isFinite(sortOrder) ? Math.max(maxOrder, sortOrder) : maxOrder;
  }, -1);

  const { data: createdGroup, error: createGroupError } = await supabase
    .from("task_group")
    .insert({
      organization_id: organizationId,
      group_name: "New",
      sort_order: lastSortOrder + 1,
    })
    .select("group_id")
    .single();

  if (createGroupError) {
    throw new Error(createGroupError.message);
  }

  return createdGroup.group_id;
}

// Most-recently-assigned distinct task titles for the organization, newest first.
// Used to ground Smart Task Creation in what has actually been allocated before,
// instead of always generating the same static placeholder titles.
async function getRecentAllocationTitles(supabase, organizationId) {
  const { data: existingTasks } = await supabase
    .from("task")
    .select("task_id, title")
    .eq("organization_id", organizationId);

  const titleByTaskId = new Map((existingTasks ?? []).map((task) => [task.task_id, task.title]));
  const taskIds = [...titleByTaskId.keys()];

  if (!taskIds.length) {
    return [];
  }

  const { data: assignments } = await supabase
    .from("task_assignment")
    .select("task_id, assigned_at")
    .in("task_id", taskIds)
    .order("assigned_at", { ascending: false });

  const seen = new Set();
  const recentTitles = [];

  for (const assignment of assignments ?? []) {
    const title = titleByTaskId.get(assignment.task_id);
    if (title && !seen.has(title)) {
      seen.add(title);
      recentTitles.push(title);
    }
  }

  return recentTitles;
}

// Skills of whoever most recently did work under each given title — used as a
// proxy "required skill set" for a follow-up task generated from that history.
// Returns a Map(title -> skill_id[]); titles with no history or no skills on
// file for that assignee map to an empty array.
async function getInferredSkillIdsByTitle(supabase, organizationId, titles) {
  const result = new Map(titles.map((title) => [title, []]));

  if (!titles.length) {
    return result;
  }

  const { data: historicalTasks } = await supabase
    .from("task")
    .select("task_id, title")
    .eq("organization_id", organizationId)
    .in("title", titles);

  const taskIdsByTitle = new Map();
  for (const task of historicalTasks ?? []) {
    const list = taskIdsByTitle.get(task.title) ?? [];
    list.push(task.task_id);
    taskIdsByTitle.set(task.title, list);
  }

  const historicalTaskIds = (historicalTasks ?? []).map((task) => task.task_id);

  if (!historicalTaskIds.length) {
    return result;
  }

  const { data: assignments } = await supabase
    .from("task_assignment")
    .select("task_id, user_id, assigned_at")
    .in("task_id", historicalTaskIds)
    .order("assigned_at", { ascending: false });

  const latestAssigneeByTaskId = new Map();
  for (const assignment of assignments ?? []) {
    if (!latestAssigneeByTaskId.has(assignment.task_id)) {
      latestAssigneeByTaskId.set(assignment.task_id, assignment.user_id);
    }
  }

  const assigneeIdByTitle = new Map();
  for (const [title, taskIds] of taskIdsByTitle.entries()) {
    const assigneeId = taskIds.map((id) => latestAssigneeByTaskId.get(id)).find(Boolean);
    if (assigneeId) {
      assigneeIdByTitle.set(title, assigneeId);
    }
  }

  const assigneeIds = [...new Set(assigneeIdByTitle.values())];

  if (!assigneeIds.length) {
    return result;
  }

  const { data: skillRows } = await supabase
    .from("user_skill")
    .select("user_id, skill_id")
    .in("user_id", assigneeIds);

  const skillIdsByUserId = new Map();
  for (const row of skillRows ?? []) {
    const list = skillIdsByUserId.get(row.user_id) ?? [];
    list.push(row.skill_id);
    skillIdsByUserId.set(row.user_id, list);
  }

  for (const [title, assigneeId] of assigneeIdByTitle.entries()) {
    result.set(title, skillIdsByUserId.get(assigneeId) ?? []);
  }

  return result;
}

async function createInitialOptimusTasks(supabase, { organizationId, userId }) {
  const groupId = await ensureNewTaskGroup(supabase, organizationId);
  const { data: organization } = await supabase
    .from("organization")
    .select("organization_name")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const organizationName = cleanString(organization?.organization_name) || "organization";

  const { data: lastTask } = await supabase
    .from("task")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const firstSortOrder = Number.isFinite(Number(lastTask?.sort_order))
    ? Number(lastTask.sort_order) + 1
    : 0;

  const recentTitles = await getRecentAllocationTitles(supabase, organizationId);
  const historyTitles = recentTitles.slice(0, 3);
  const inferredSkillIdsByTitle = await getInferredSkillIdsByTitle(
    supabase,
    organizationId,
    historyTitles,
  );

  // Prefer follow-up tasks modeled on titles that were actually assigned before;
  // only fall back to generic organization-goal prompts to fill any remaining slots.
  const historyBased = historyTitles.map((title) => ({
    title: `Follow-up: ${title}`,
    description: "Generated by Optimus AI from allocation history.",
    requiredSkillIds: inferredSkillIdsByTitle.get(title) ?? [],
    reasons: {
      creation: [`Analyzed allocation history — "${title}" was assigned before`],
      creationKind: "allocation_history",
    },
  }));

  const fallbackPool = [
    `Clarify ${organizationName} requirements`,
    `Prepare ${organizationName} execution plan`,
    `Review ${organizationName} delivery risks`,
  ];
  const remainingSlots = Math.max(0, 3 - historyBased.length);
  const fallbackBased = fallbackPool.slice(0, remainingSlots).map((title) => ({
    title,
    description: "Generated by Optimus AI.",
    requiredSkillIds: [],
    reasons: {
      creation: ["No allocation history yet — created from organization goals"],
      creationKind: "baseline",
    },
  }));

  const tasksToCreate = [...historyBased, ...fallbackBased];

  const { data: createdTasks, error } = await supabase
    .from("task")
    .insert(
      tasksToCreate.map((task, index) => ({
        organization_id: organizationId,
        group_id: groupId,
        title: task.title,
        description: task.description,
        owner_id: userId,
        assigned_to: null,
        status: "Open",
        priority: "Medium",
        source: "optimus_ai",
        ai_state: "active",
        reasons: task.reasons,
        sort_order: firstSortOrder + index,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    )
    .select("task_id");

  if (error) {
    throw new Error(error.message);
  }

  for (let index = 0; index < (createdTasks ?? []).length; index += 1) {
    const skillIds = tasksToCreate[index]?.requiredSkillIds;
    if (skillIds?.length) {
      await syncTaskSkills(supabase, createdTasks[index].task_id, skillIds);
    }
  }
}

// Auto-assign any unassigned, non-terminal task to the best-matching employee
// using three independent signals, each scored only when it's actually
// present so we never fabricate a match that didn't happen:
//   - task_skill vs. user_skill overlap (weighted by proficiency level)
//   - allocation history: how many times this exact task title was assigned
//     to this employee before, org-wide
//   - department match: the employee's department name appears in the title
// A task is only assigned when at least one signal contributes a positive
// score — ties are broken by whichever employee is scanned first.
async function autoAllocateOptimusTasks(supabase, { organizationId }) {
  const { data: candidateTasks, error: candidateError } = await supabase
    .from("task")
    .select("task_id, title, reasons")
    .eq("organization_id", organizationId)
    .is("assigned_to", null)
    .not("status", "in", "(Completed,Cancelled)");

  if (candidateError) {
    throw new Error(candidateError.message);
  }

  if (!(candidateTasks ?? []).length) {
    return 0;
  }

  const candidateTaskIds = candidateTasks.map((task) => task.task_id);

  const [
    { data: requiredSkillRows, error: requiredSkillError },
    { data: employeeAccounts, error: employeeError },
    { data: allOrgTasks, error: orgTasksError },
  ] = await Promise.all([
    supabase
      .from("task_skill")
      .select("task_id, skill_id, skill:skill_id(skill_name)")
      .in("task_id", candidateTaskIds),
    supabase
      .from("user_account")
      .select("user_id, department:department_id(department_name)")
      .eq("organization_id", organizationId),
    supabase.from("task").select("task_id, title").eq("organization_id", organizationId),
  ]);

  if (requiredSkillError) {
    throw new Error(requiredSkillError.message);
  }

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  if (orgTasksError) {
    throw new Error(orgTasksError.message);
  }

  const requiredSkillsByTaskId = new Map();
  for (const row of requiredSkillRows ?? []) {
    const list = requiredSkillsByTaskId.get(row.task_id) ?? [];
    list.push({ skillId: row.skill_id, name: row.skill?.skill_name });
    requiredSkillsByTaskId.set(row.task_id, list);
  }

  const employeeIds = (employeeAccounts ?? []).map((employee) => employee.user_id);
  const departmentByUserId = new Map(
    (employeeAccounts ?? []).map((employee) => [employee.user_id, employee.department?.department_name ?? null]),
  );
  const departmentNames = [
    ...new Set((employeeAccounts ?? []).map((employee) => employee.department?.department_name).filter(Boolean)),
  ];

  const skillsByUserId = new Map();
  if (employeeIds.length) {
    const { data: skillRows } = await supabase
      .from("user_skill")
      .select("user_id, skill_id, proficiency_level")
      .in("user_id", employeeIds);

    for (const row of skillRows ?? []) {
      const list = skillsByUserId.get(row.user_id) ?? [];
      list.push({ skillId: row.skill_id, level: Number(row.proficiency_level) || 1 });
      skillsByUserId.set(row.user_id, list);
    }
  }

  // Allocation-history pattern: how many times has each employee previously
  // been assigned a task with this exact title, anywhere in the org?
  const titleByTaskId = new Map(
    (allOrgTasks ?? []).map((task) => [task.task_id, cleanString(task.title).toLowerCase()]),
  );
  const allTaskIds = [...titleByTaskId.keys()];
  const historyCountByTitleAndUser = new Map();

  if (allTaskIds.length) {
    const { data: historyAssignments, error: historyError } = await supabase
      .from("task_assignment")
      .select("task_id, user_id")
      .in("task_id", allTaskIds);

    if (historyError) {
      throw new Error(historyError.message);
    }

    for (const assignment of historyAssignments ?? []) {
      const title = titleByTaskId.get(assignment.task_id);
      if (!title || !assignment.user_id) continue;
      const byUser = historyCountByTitleAndUser.get(title) ?? new Map();
      byUser.set(assignment.user_id, (byUser.get(assignment.user_id) ?? 0) + 1);
      historyCountByTitleAndUser.set(title, byUser);
    }
  }

  let assignedCount = 0;

  for (const task of candidateTasks) {
    const requiredSkills = requiredSkillsByTaskId.get(task.task_id) ?? [];
    const requiredSkillIds = new Set(requiredSkills.map((skill) => skill.skillId));
    const normalizedTitle = cleanString(task.title).toLowerCase();
    const historyByUser = historyCountByTitleAndUser.get(normalizedTitle) ?? new Map();
    const matchedDepartment = departmentNames.find(
      (name) => name && normalizedTitle.includes(name.toLowerCase()),
    );

    let bestEmployeeId = null;
    let bestScore = 0;
    let bestBreakdown = null;

    for (const employeeId of employeeIds) {
      const employeeSkills = skillsByUserId.get(employeeId) ?? [];
      const skillScore = employeeSkills
        .filter((skill) => requiredSkillIds.has(skill.skillId))
        .reduce((sum, skill) => sum + skill.level, 0);
      const historyCount = historyByUser.get(employeeId) ?? 0;
      const isDepartmentMatch = Boolean(
        matchedDepartment && departmentByUserId.get(employeeId) === matchedDepartment,
      );

      const score = skillScore * 3 + historyCount * 4 + (isDepartmentMatch ? 2 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestEmployeeId = employeeId;
        bestBreakdown = { skillScore, historyCount, isDepartmentMatch };
      }
    }

    if (!bestEmployeeId) {
      continue;
    }

    const allocationReasons = [];
    if (bestBreakdown.skillScore > 0) {
      const matchedNames = requiredSkills.map((skill) => skill.name).filter(Boolean);
      allocationReasons.push(`Matched required skills: ${matchedNames.join(", ")}`);
    }
    if (bestBreakdown.historyCount > 0) {
      allocationReasons.push(`Assigned to "${task.title}" ${bestBreakdown.historyCount} time(s) before`);
    }
    if (bestBreakdown.isDepartmentMatch) {
      allocationReasons.push(`Matches ${matchedDepartment} department`);
    }

    const allocationKind =
      bestBreakdown.skillScore > 0
        ? "skill_match"
        : bestBreakdown.historyCount > 0
          ? "history_pattern"
          : "department_match";

    const { error: updateError } = await supabase
      .from("task")
      .update({
        assigned_to: bestEmployeeId,
        reasons: {
          ...(task.reasons ?? {}),
          allocation: allocationReasons,
          allocationKind,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("task_id", task.task_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Keep the multi-assignee set in sync so the AI pick actually shows up as
    // an assignee chip on the card, not just the legacy assigned_to mirror.
    await supabase
      .from("task_assignee")
      .upsert({ task_id: task.task_id, user_id: bestEmployeeId }, { onConflict: "task_id,user_id", ignoreDuplicates: true });

    await recordAssignment(supabase, {
      taskId: task.task_id,
      userId: bestEmployeeId,
      assignedBy: "Optimus AI",
    });

    assignedCount += 1;
  }

  return assignedCount;
}

// Detect a title the manager has been recreating on a consistent weekly
// cadence (same weekday + time of day, within a couple hours of drift) and,
// once the next occurrence is due, create it as an Optimus AI suggestion
// awaiting Approve/Reject rather than silently adding a committed task.
// Idempotent: re-running finds the already-created occurrence and skips it,
// so it's safe to call on every board load instead of needing a scheduler.
async function generateRecurringOptimusTasks(supabase, { organizationId, userId }) {
  const { data: orgTasks, error } = await supabase
    .from("task")
    .select("task_id, title, group_id, start_datetime, end_datetime")
    .eq("organization_id", organizationId)
    .not("start_datetime", "is", null);

  if (error || !(orgTasks ?? []).length) {
    return 0;
  }

  const byTitle = new Map();
  for (const task of orgTasks) {
    const key = cleanString(task.title).toLowerCase();
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push(task);
    byTitle.set(key, list);
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * ONE_DAY_MS;
  const TOLERANCE_MS = 2 * 60 * 60 * 1000;

  const recurringTitles = [];

  for (const occurrences of byTitle.values()) {
    if (occurrences.length < 2) continue;

    const sorted = [...occurrences].sort(
      (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
    );

    const intervals = [];
    for (let i = 1; i < sorted.length; i += 1) {
      intervals.push(
        new Date(sorted[i].start_datetime).getTime() - new Date(sorted[i - 1].start_datetime).getTime(),
      );
    }

    const isWeeklyPattern = intervals.every((interval) => Math.abs(interval - WEEK_MS) <= TOLERANCE_MS);
    if (!isWeeklyPattern) continue;

    const latest = sorted[sorted.length - 1];
    const latestStart = new Date(latest.start_datetime);
    const nextStart = new Date(latestStart.getTime() + WEEK_MS);

    if (nextStart.getTime() > Date.now() + ONE_DAY_MS) continue;

    const alreadyExists = sorted.some(
      (task) => Math.abs(new Date(task.start_datetime).getTime() - nextStart.getTime()) <= TOLERANCE_MS,
    );
    if (alreadyExists) continue;

    const duration = latest.end_datetime
      ? new Date(latest.end_datetime).getTime() - latestStart.getTime()
      : null;
    const nextEnd = duration ? new Date(nextStart.getTime() + duration) : null;
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(latestStart);
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(latestStart);

    recurringTitles.push({
      title: latest.title,
      groupId: latest.group_id ?? null,
      startDatetime: nextStart.toISOString(),
      endDatetime: nextEnd ? nextEnd.toISOString() : null,
      reasons: {
        creation: [`Usually created every ${weekday} at ${time}`],
        creationKind: "recurring_pattern",
      },
    });
  }

  if (!recurringTitles.length) {
    return 0;
  }

  const { data: lastTask } = await supabase
    .from("task")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSortOrder = Number.isFinite(Number(lastTask?.sort_order)) ? Number(lastTask.sort_order) + 1 : 0;

  const nowIso = new Date().toISOString();
  const { error: insertError } = await supabase.from("task").insert(
    recurringTitles.map((candidate) => ({
      organization_id: organizationId,
      group_id: candidate.groupId,
      title: candidate.title,
      description: "Detected from your recurring task-creation pattern.",
      owner_id: userId,
      assigned_to: null,
      status: "Open",
      priority: "Medium",
      start_datetime: candidate.startDatetime,
      end_datetime: candidate.endDatetime,
      source: "optimus_ai",
      ai_state: "active",
      reasons: candidate.reasons,
      sort_order: nextSortOrder++,
      created_at: nowIso,
      updated_at: nowIso,
    })),
  );

  return insertError ? 0 : recurringTitles.length;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);

    if (organizationId) {
      await generateRecurringOptimusTasks(supabase, { organizationId, userId: user.id }).catch(() => 0);
    }

    let query = supabase
      .from("task")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const taskIds = (data ?? []).map((task) => task.task_id).filter(Boolean);
    let latestAssignmentByTaskId = new Map();
    let requiredSkillsByTaskId = new Map();
    let assigneeIdsByTaskId = new Map();

    if (taskIds.length) {
      const [
        { data: assignments, error: assignmentError },
        { data: skillRows, error: skillError },
        { data: assigneeRows, error: assigneeError },
      ] = await Promise.all([
        supabase
          .from("task_assignment")
          .select("task_id, assigned_by, assigned_at")
          .in("task_id", taskIds)
          .order("assigned_at", { ascending: false }),
        supabase
          .from("task_skill")
          .select("task_id, skill_id, skill:skill_id(skill_name)")
          .in("task_id", taskIds),
        supabase.from("task_assignee").select("task_id, user_id").in("task_id", taskIds),
      ]);

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 400 });
      }

      if (skillError) {
        return NextResponse.json({ error: skillError.message }, { status: 400 });
      }

      if (assigneeError) {
        return NextResponse.json({ error: assigneeError.message }, { status: 400 });
      }

      for (const assignment of assignments ?? []) {
        if (!latestAssignmentByTaskId.has(assignment.task_id)) {
          latestAssignmentByTaskId.set(assignment.task_id, assignment);
        }
      }

      for (const row of skillRows ?? []) {
        const list = requiredSkillsByTaskId.get(row.task_id) ?? [];
        list.push({ skill_id: row.skill_id, skill_name: row.skill?.skill_name });
        requiredSkillsByTaskId.set(row.task_id, list);
      }

      for (const row of assigneeRows ?? []) {
        const list = assigneeIdsByTaskId.get(row.task_id) ?? [];
        list.push(row.user_id);
        assigneeIdsByTaskId.set(row.task_id, list);
      }
    }

    const visibleTasks = (data ?? []).filter(
      (task) => !["hidden", "dismissed"].includes(String(task.ai_state || "").toLowerCase()),
    );

    const tasks = visibleTasks.map((task) => {
      const latestAssignment = latestAssignmentByTaskId.get(task.task_id);

      return {
        ...task,
        latest_assigned_by: latestAssignment?.assigned_by ?? null,
        latest_assigned_at: latestAssignment?.assigned_at ?? null,
        requiredSkills: requiredSkillsByTaskId.get(task.task_id) ?? [],
        assigneeIds: assigneeIdsByTaskId.get(task.task_id) ?? [],
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
      groupId,
      title,
      description,
      assignedTo,
      assignedBy,
      source,
      aiState,
      reasons: reason,
      status,
      priority,
      startDatetime,
      endDatetime,
      requiredSkillIds,
    } = await request.json();

    if (!cleanString(title)) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const { data: lastTask } = await supabase
      .from("task")
      .select("sort_order")
      .eq("organization_id", organizationId)
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
        group_id: groupId ?? null,
        title: cleanString(title),
        description: cleanString(description) || null,
        owner_id: user.id,
        assigned_to: assignedTo || null,
        status: cleanString(status) || "Open",
        priority: cleanString(priority) || "Medium",
        start_datetime: startDatetime || null,
        end_datetime: endDatetime || null,
        source: cleanString(source) || "manual",
        ai_state: aiState || null,
        reasons: reason || null,
        sort_order: nextSortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("task_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (requiredSkillIds !== undefined) {
      await syncTaskSkills(supabase, createdTask.task_id, requiredSkillIds);
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
      tasks,
      taskId,
      userId,
      groupId,
      title,
      description,
      assignedTo,
      assignedBy,
      aiState,
      status,
      priority,
      startDatetime,
      endDatetime,
      requiredSkillIds,
    } = body;

    if (action === "set-ai-task-visibility") {
      const isEnabled = Boolean(body.enabled);
      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!organizationId) {
        return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
      }

      const { data: existingAiTasks, error: existingAiError } = await supabase
        .from("task")
        .select("task_id")
        .eq("organization_id", organizationId)
        .eq("source", "optimus_ai")
        .limit(1);

      if (existingAiError) {
        return NextResponse.json({ error: existingAiError.message }, { status: 400 });
      }

      if (isEnabled && !(existingAiTasks ?? []).length) {
        await createInitialOptimusTasks(supabase, {
          organizationId,
          userId: user.id,
        });

        return NextResponse.json({ success: true, created: true });
      }

      const { error: visibilityError } = await supabase
        .from("task")
        .update({
          ai_state: isEnabled ? "active" : "hidden",
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("source", "optimus_ai")
        .in("ai_state", isEnabled ? ["hidden"] : ["active"]);

      if (visibilityError) {
        return NextResponse.json({ error: visibilityError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "approve-ai-task") {
      if (!taskId) {
        return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
      }

      const { data: existingTask } = await supabase
        .from("task")
        .select("reasons")
        .eq("task_id", taskId)
        .maybeSingle();

      const actor = assignedBy || (await getActorName(supabase, user));
      const approvedAt = new Date().toISOString();
      const nextReasons = {
        ...(existingTask?.reasons ?? {}),
        approvedBy: actor,
        approvedAt,
      };

      const { error: approveError } = await supabase
        .from("task")
        .update({ ai_state: "accepted", reasons: nextReasons, updated_at: approvedAt })
        .eq("task_id", taskId);

      if (approveError) {
        return NextResponse.json({ error: approveError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, approvedBy: actor, approvedAt });
    }

    if (action === "auto-allocate-tasks") {
      if (!body.enabled) {
        return NextResponse.json({ success: true, assigned: 0 });
      }

      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!organizationId) {
        return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
      }

      const assigned = await autoAllocateOptimusTasks(supabase, { organizationId });

      return NextResponse.json({ success: true, assigned });
    }

    // Multi-assignee actions: task_assignee holds the full current set of
    // people on a task. assigned_to (single column) is kept as a best-effort
    // "an assignee" mirror so existing allocation-history/auto-allocate logic
    // — which only understands a single assignee — keeps working sensibly.
    if (action === "assign-employee") {
      if (!taskId || !userId) {
        return NextResponse.json({ error: "Task ID and user ID are required." }, { status: 400 });
      }

      const { data: existingAssignee } = await supabase
        .from("task_assignee")
        .select("task_id")
        .eq("task_id", taskId)
        .eq("user_id", userId)
        .maybeSingle();

      // Only log a new allocation-history entry the first time this person is
      // added to the task — re-assigning someone already on it is a no-op.
      if (!existingAssignee) {
        const { error: assigneeError } = await supabase
          .from("task_assignee")
          .insert({ task_id: taskId, user_id: userId });

        if (assigneeError) {
          return NextResponse.json({ error: assigneeError.message }, { status: 400 });
        }

        const actor = assignedBy || (await getActorName(supabase, user));
        await recordAssignment(supabase, { taskId, userId, assignedBy: actor });
      }

      const { data: existingTask } = await supabase
        .from("task")
        .select("assigned_to")
        .eq("task_id", taskId)
        .maybeSingle();

      if (!existingTask?.assigned_to) {
        const { error: updateError } = await supabase
          .from("task")
          .update({ assigned_to: userId, updated_at: new Date().toISOString() })
          .eq("task_id", taskId);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === "unassign-employee") {
      if (!taskId || !userId) {
        return NextResponse.json({ error: "Task ID and user ID are required." }, { status: 400 });
      }

      const { error: deleteError } = await supabase
        .from("task_assignee")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", userId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 400 });
      }

      const { data: existingTask } = await supabase
        .from("task")
        .select("assigned_to")
        .eq("task_id", taskId)
        .maybeSingle();

      if (existingTask?.assigned_to === userId) {
        const { data: remaining } = await supabase
          .from("task_assignee")
          .select("user_id")
          .eq("task_id", taskId)
          .limit(1)
          .maybeSingle();

        const { error: updateError } = await supabase
          .from("task")
          .update({ assigned_to: remaining?.user_id ?? null, updated_at: new Date().toISOString() })
          .eq("task_id", taskId);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true });
    }

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
      status: cleanString(status) || "Open",
      priority: cleanString(priority) || "Medium",
      start_datetime: startDatetime || null,
      end_datetime: endDatetime || null,
      updated_at: new Date().toISOString(),
    };
    // Only touch assignment when the caller explicitly provided it — the task
    // detail panel no longer manages assignment, so omitting this field must
    // leave the existing assignee untouched (assignment happens via reassign
    // or auto-allocation instead).
    if (assignedTo !== undefined) {
      taskUpdates.assigned_to = assignedTo || null;
    }
    // Only change the group when explicitly provided (move between groups).
    if (groupId !== undefined) {
      taskUpdates.group_id = groupId;
    }

    // Detect a real assignment change so we can log it in the allocation history.
    const { data: existingTask } = await supabase
      .from("task")
      .select("assigned_to, source, ai_state")
      .eq("task_id", taskId)
      .maybeSingle();

    if (aiState !== undefined) {
      taskUpdates.ai_state = aiState;
    } else if (
      existingTask?.source === "optimus_ai" &&
      !["accepted", "dismissed"].includes(String(existingTask?.ai_state || "").toLowerCase())
    ) {
      taskUpdates.ai_state = "accepted";
    }

    const { error } = await supabase.from("task").update(taskUpdates).eq("task_id", taskId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (requiredSkillIds !== undefined) {
      await syncTaskSkills(supabase, taskId, requiredSkillIds);
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

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    // None of these cascade-delete on task_id, so clear them first or the
    // task delete below fails with a foreign-key violation.
    await supabase.from("task_assignment").delete().eq("task_id", taskId);
    await supabase.from("task_assignee").delete().eq("task_id", taskId);
    await supabase.from("task_comment").delete().eq("task_id", taskId);
    await supabase.from("task_file").delete().eq("task_id", taskId);
    await supabase.from("task_skill").delete().eq("task_id", taskId);
    await supabase.from("task_qualification").delete().eq("task_id", taskId);

    const { error } = await supabase.from("task").delete().eq("task_id", taskId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
