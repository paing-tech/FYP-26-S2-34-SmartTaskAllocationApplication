import { NextResponse } from "next/server";
import { getAuthenticatedUser, requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { ensureUntitledGroup } from "@/lib/taskGroups";
import { notifyAgentOwnerTelegram } from "@/lib/agentNotifications";
import { syncStartedTaskStatuses } from "@/lib/taskStatusSync";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Only accounts with the Employee role are eligible for task assignment —
// managers and user admins are excluded, whether assigned by AI or manually.
function isEmployeeRole(roleName) {
  return String(roleName ?? "").trim().toLowerCase() === "employee";
}

function todayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// "Available today" mirrors the manager UI's Available/Away badge: either
// scheduled to work today, or already clocked in — same source the
// EmployeeAssignCard uses. The AI picker should never land a task on someone
// who isn't actually working today.
async function getAvailableTodayUserIds(supabase, userIds) {
  if (!userIds.length) return new Set();
  const today = todayDateStr();

  const [{ data: scheduleRows }, { data: attendanceRows }] = await Promise.all([
    supabase.from("attendance_schedule").select("user_id").in("user_id", userIds).eq("work_date", today),
    supabase
      .from("attendance")
      .select("user_id")
      .in("user_id", userIds)
      .eq("work_date", today)
      .not("clock_in_at", "is", null),
  ]);

  const availableIds = new Set();
  for (const row of scheduleRows ?? []) availableIds.add(row.user_id);
  for (const row of attendanceRows ?? []) availableIds.add(row.user_id);
  return availableIds;
}

// Server-side backstop for every manual-assignment path — the client-side
// picker in WorkspaceBoard.js already narrows the UI to Employee accounts,
// but a direct API call could otherwise bypass that and assign a Manager or
// User Admin.
async function assertEmployeeAssignee(supabase, organizationId, userId) {
  if (!organizationId || !userId) return false;
  const { data: account } = await supabase
    .from("user_account")
    .select("role:role_id(role_name)")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return isEmployeeRole(account?.role?.role_name);
}

// Lets the Telegram webhook (which has no logged-in manager session) create
// tasks on an agent's behalf. Scoped narrowly to POST/PATCH here — never
// touches the shared requireManager/getAuthenticatedUser helpers, so every
// other route's auth is completely unaffected. The secret is server-only
// and never sent to a browser.
function getInternalAuthUser(request) {
  const secret = request.headers.get("x-agent-internal-secret");
  const userId = request.headers.get("x-agent-internal-user-id");
  if (secret && userId && process.env.AGENT_INTERNAL_API_SECRET && secret === process.env.AGENT_INTERNAL_API_SECRET) {
    return { id: userId };
  }
  return null;
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
// assignmentMethod tags how it happened — "task_creation" (assignee picked
// in the same request the task was created), "manual_modal" (a manager
// picked someone later via the Employee Assignment modal), or "ai_auto"
// (Optimus AI/the chat agent assigned it itself at creation) — so
// Allocation Efficiency reporting can measure each honestly instead of
// lumping them together.
async function recordAssignment(supabase, { taskId, userId, assignedBy, assignmentMethod }) {
  if (!taskId || !userId) return;
  await supabase.from("task_assignment").insert({
    task_id: taskId,
    user_id: userId,
    assigned_by: assignedBy || "Manager",
    assigned_at: new Date().toISOString(),
    status: "Assigned",
    assignment_method: assignmentMethod || null,
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

// Required skills for a follow-up task generated from history — read from
// the most recent previous occurrence's OWN task_skill rows (what the task
// itself actually needed), not inferred from whoever happened to end up
// assigned to it. The earlier version copied the latest assignee's entire
// personal skill set instead, which broke down badly for any assignment
// that wasn't a genuine skill match — e.g. a "least busy" fallback pick, or
// a since-corrected "Assign with AI" click still sitting in the assignment
// log — and could hand a completely unrelated task a wrong skill set that
// then dragged the auto-assigner along with it.
// Walks each title's occurrences newest-first and uses the first one that
// actually has task_skill rows, rather than always the single newest
// occurrence — otherwise a newer but untagged recreation (e.g. one the
// recurring-pattern detector generated, which doesn't set skills) would
// silently shadow an older occurrence that was properly tagged.
// Returns a Map(title -> skill_id[]); titles with no history or no
// recorded skills anywhere in their history map to an empty array.
async function getInferredSkillIdsByTitle(supabase, organizationId, titles) {
  const result = new Map(titles.map((title) => [title, []]));

  if (!titles.length) {
    return result;
  }

  const { data: historicalTasks } = await supabase
    .from("task")
    .select("task_id, title")
    .eq("organization_id", organizationId)
    .in("title", titles)
    // A dismissed AI suggestion was rejected for a reason — never worth
    // trusting as a skill signal, even if its task_skill rows were never
    // individually cleaned up. Manually-created tasks have ai_state: null,
    // so a plain .neq() would wrongly exclude them too (SQL's `<> 'x'` is
    // NULL, not true, when the column itself is NULL) — the explicit "is
    // null" branch keeps those included.
    .or("ai_state.is.null,ai_state.neq.dismissed")
    .order("created_at", { ascending: false });

  if (!(historicalTasks ?? []).length) {
    return result;
  }

  const taskIdsByTitle = new Map();
  for (const task of historicalTasks) {
    const list = taskIdsByTitle.get(task.title) ?? [];
    list.push(task.task_id);
    taskIdsByTitle.set(task.title, list);
  }

  const { data: skillRows } = await supabase
    .from("task_skill")
    .select("task_id, skill_id")
    .in("task_id", historicalTasks.map((task) => task.task_id));

  const skillIdsByTaskId = new Map();
  for (const row of skillRows ?? []) {
    const list = skillIdsByTaskId.get(row.task_id) ?? [];
    list.push(row.skill_id);
    skillIdsByTaskId.set(row.task_id, list);
  }

  for (const [title, taskIds] of taskIdsByTitle.entries()) {
    const taggedTaskId = taskIds.find((taskId) => skillIdsByTaskId.has(taskId));
    if (taggedTaskId) {
      result.set(title, skillIdsByTaskId.get(taggedTaskId));
    }
  }

  return result;
}

// A small set of common "what naturally happens next" patterns, used when
// OpenAI is unavailable — same fallback spirit as the other src/app/api/agent
// routes. Matched as a case-insensitive substring against the completed
// task's title.
const COMPLETION_FOLLOWUP_PATTERNS = [
  { match: /pack(ed|ing)?\b/i, title: "Book delivery service", description: "Arrange delivery/courier pickup for the packed order." },
  { match: /\border(s|ed)?\b/i, title: "Confirm order fulfillment", description: "Confirm the order was fulfilled and notify the customer." },
  { match: /\bship(ped|ping)?\b/i, title: "Confirm delivery tracking", description: "Share tracking details and confirm delivery status." },
  { match: /\bdeploy(ed|ment)?\b/i, title: "Notify stakeholders of deployment", description: "Let stakeholders know the deployment is live and monitor for issues." },
  { match: /\b(hire|onboard(ed|ing)?)\b/i, title: "Schedule 30-day check-in", description: "Schedule a check-in with the new hire after their first month." },
];

function fallbackCompletionFollowUp(completedTitle) {
  const match = COMPLETION_FOLLOWUP_PATTERNS.find((pattern) => pattern.match.test(completedTitle));
  if (!match) return null;
  return { title: match.title, description: match.description, priority: "Medium", requiredSkillNames: [] };
}

// Resolves skill names (from AI output) to skill_ids, creating any that don't
// already exist in the shared skill catalog — same get-or-create pattern used
// by /api/skills and /api/my-profile.
async function resolveSkillIdsByName(supabase, names) {
  const ids = [];
  for (const name of names ?? []) {
    const trimmed = cleanString(name);
    if (!trimmed) continue;

    const { data: existingSkill } = await supabase
      .from("skill")
      .select("skill_id")
      .ilike("skill_name", trimmed)
      .maybeSingle();

    if (existingSkill?.skill_id) {
      ids.push(existingSkill.skill_id);
      continue;
    }

    const { data: createdSkill } = await supabase
      .from("skill")
      .insert({ skill_name: trimmed })
      .select("skill_id")
      .single();

    if (createdSkill?.skill_id) {
      ids.push(createdSkill.skill_id);
    }
  }
  return ids;
}

// Smart Task Creation's completion hook: when a task is marked Completed,
// suggest one natural follow-up task (e.g. "Pack orders" -> "Book delivery
// service"), landing pending approval (glowing border, Approve/Reject on the
// card) in the same column as the task that was just completed.
async function generateCompletionFollowUpTask(supabase, { organizationId, userId, completedTitle, groupId }) {
  if (!organizationId) return;

  let followUp = null;
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const prompt = `A manager just marked the task "${completedTitle}" as Completed in a task-allocation app.
If there is an obvious, common-sense next step that should happen after this specific task (for example: "Pack orders" -> "Book delivery service", "Deploy to production" -> "Notify stakeholders", "Onboard new hire" -> "Schedule 30-day check-in"), propose exactly one short follow-up task.
If there's no obvious follow-up, return an empty tasks array — do not force one.
Return ONLY JSON of the form:
{"tasks":[{"title":"<short actionable title>","description":"<one sentence>","priority":"Low"|"Medium"|"High"|"Urgent","requiredSkillNames":["<skill>","..."]}]}`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.4,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed.");

      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      const candidate = Array.isArray(parsed.tasks) ? parsed.tasks[0] : null;

      if (candidate?.title) {
        followUp = {
          title: cleanString(candidate.title),
          description: cleanString(candidate.description),
          priority: ["Low", "Medium", "High", "Urgent"].includes(candidate.priority) ? candidate.priority : "Medium",
          requiredSkillNames: Array.isArray(candidate.requiredSkillNames)
            ? candidate.requiredSkillNames.map((name) => cleanString(name)).filter(Boolean).slice(0, 5)
            : [],
        };
      }
    } catch {
      followUp = fallbackCompletionFollowUp(completedTitle);
    }
  } else {
    followUp = fallbackCompletionFollowUp(completedTitle);
  }

  if (!followUp?.title) return;

  const resolvedGroupId = groupId || (await ensureUntitledGroup(supabase, organizationId));
  const requiredSkillIds = await resolveSkillIdsByName(supabase, followUp.requiredSkillNames);

  const { data: lastTask } = await supabase
    .from("task")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = Number.isFinite(Number(lastTask?.sort_order)) ? Number(lastTask.sort_order) + 1 : 0;

  const { data: createdTask, error: createError } = await supabase
    .from("task")
    .insert({
      organization_id: organizationId,
      group_id: resolvedGroupId,
      title: followUp.title,
      description: followUp.description || null,
      owner_id: userId,
      status: "Open",
      priority: followUp.priority,
      source: "optimus_ai",
      ai_state: "active",
      reasons: {
        creation: [`"${completedTitle}" was completed — suggested a natural follow-up`],
        creationKind: "completion_followup",
      },
      sort_order: nextSortOrder,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("task_id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  if (requiredSkillIds.length) {
    await syncTaskSkills(supabase, createdTask.task_id, requiredSkillIds);
  }

  await autoAssignAiTask(supabase, { organizationId, taskId: createdTask.task_id });
}

// Org-wide data every AI-assignment decision needs (eligible+available
// employees, their skills, department map, current active-task load, and a
// title -> task_id index for the history signal) — fetched ONCE per batch
// and reused across every task being scored in that batch, instead of each
// task re-fetching the whole org from scratch. That re-fetch-per-task
// pattern was the main reason bulk AI task creation got slow: N tasks used
// to mean N full org scans instead of one.
async function loadAllocationContext(supabase, { organizationId }) {
  const [{ data: employeeAccounts }, { data: allOrgTasks }] = await Promise.all([
    supabase
      .from("user_account")
      .select("user_id, department:department_id(department_name), role:role_id(role_name)")
      .eq("organization_id", organizationId),
    supabase.from("task").select("task_id, title, assigned_to, status").eq("organization_id", organizationId),
  ]);

  const eligibleEmployeeIds = (employeeAccounts ?? [])
    .filter((employee) => isEmployeeRole(employee.role?.role_name))
    .map((employee) => employee.user_id);
  const availableTodayIds = await getAvailableTodayUserIds(supabase, eligibleEmployeeIds);
  // Only consider employees actually working today — someone away today is
  // never a candidate, not even as a fallback.
  const employeeIds = eligibleEmployeeIds.filter((id) => availableTodayIds.has(id));

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
      .select("user_id, skill_id")
      .in("user_id", employeeIds);

    for (const row of skillRows ?? []) {
      const list = skillsByUserId.get(row.user_id) ?? [];
      list.push(row.skill_id);
      skillsByUserId.set(row.user_id, list);
    }
  }

  // Mutated as the batch assigns tasks (see autoAssignAiTask) so several
  // no-signal tasks in the same batch spread across the team instead of all
  // landing on whoever was least busy before the batch started.
  const activeCountByUserId = new Map();
  // Lets the per-task history lookup go straight to "which task_ids share
  // this title" without an org-wide task_assignment scan for every task.
  const taskIdsByTitle = new Map();

  for (const orgTask of allOrgTasks ?? []) {
    if (orgTask.assigned_to && !["completed", "cancelled"].includes(String(orgTask.status || "").toLowerCase())) {
      activeCountByUserId.set(orgTask.assigned_to, (activeCountByUserId.get(orgTask.assigned_to) ?? 0) + 1);
    }
    const normalizedTitle = cleanString(orgTask.title).toLowerCase();
    if (!normalizedTitle) continue;
    const list = taskIdsByTitle.get(normalizedTitle) ?? [];
    list.push(orgTask.task_id);
    taskIdsByTitle.set(normalizedTitle, list);
  }

  return { employeeIds, departmentByUserId, departmentNames, skillsByUserId, activeCountByUserId, taskIdsByTitle };
}

// Scores one task's best-matching employee against an already-loaded
// context (see loadAllocationContext) — the only per-task queries left are
// this task's own required skills, its current assignees (to exclude), and
// a title-scoped task_assignment lookup (only rows for tasks sharing this
// exact title, via the context's title index, not the org's entire
// assignment history). Never suggests someone already on the task. Falls
// back to whichever eligible employee currently carries the fewest open
// tasks when no skill/history/department signal fires for anyone, so a task
// Optimus creates always ends up with someone rather than sitting
// unassigned.
async function pickAiAssigneeWithContext(supabase, context, { taskId }) {
  const { data: task, error: taskError } = await supabase
    .from("task")
    .select("task_id, title")
    .eq("task_id", taskId)
    .maybeSingle();

  if (taskError || !task) {
    return null;
  }

  const [{ data: requiredSkillRows }, { data: existingAssigneeRows }] = await Promise.all([
    supabase.from("task_skill").select("skill_id, skill:skill_id(skill_name)").eq("task_id", taskId),
    supabase.from("task_assignee").select("user_id").eq("task_id", taskId),
  ]);

  const requiredSkills = (requiredSkillRows ?? []).map((row) => ({
    skillId: row.skill_id,
    name: row.skill?.skill_name,
  }));
  const requiredSkillIds = new Set(requiredSkills.map((skill) => skill.skillId));
  const alreadyAssignedIds = new Set((existingAssigneeRows ?? []).map((row) => row.user_id));
  const employeeIds = context.employeeIds.filter((id) => !alreadyAssignedIds.has(id));

  const normalizedTitle = cleanString(task.title).toLowerCase();
  const matchingTaskIds = context.taskIdsByTitle.get(normalizedTitle) ?? [];
  const historyByUser = new Map();

  if (matchingTaskIds.length) {
    const { data: historyAssignments } = await supabase
      .from("task_assignment")
      .select("user_id")
      .in("task_id", matchingTaskIds);

    for (const assignment of historyAssignments ?? []) {
      if (!assignment.user_id) continue;
      historyByUser.set(assignment.user_id, (historyByUser.get(assignment.user_id) ?? 0) + 1);
    }
  }

  const matchedDepartment = context.departmentNames.find(
    (name) => name && normalizedTitle.includes(name.toLowerCase()),
  );

  let bestEmployeeId = null;
  let bestScore = 0;
  let bestBreakdown = null;

  for (const employeeId of employeeIds) {
    const employeeSkills = context.skillsByUserId.get(employeeId) ?? [];
    const skillScore = employeeSkills.filter((skillId) => requiredSkillIds.has(skillId)).length;
    const historyCount = historyByUser.get(employeeId) ?? 0;
    const isDepartmentMatch = Boolean(
      matchedDepartment && context.departmentByUserId.get(employeeId) === matchedDepartment,
    );

    const score = skillScore * 3 + historyCount * 4 + (isDepartmentMatch ? 2 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestEmployeeId = employeeId;
      bestBreakdown = { skillScore, historyCount, isDepartmentMatch };
    }
  }

  // No skill/history/department signal fired for anyone — fall back to
  // whichever eligible employee currently has the fewest open tasks, rather
  // than leaving an AI-created task unassigned.
  if (!bestEmployeeId && employeeIds.length) {
    let leastBusyId = null;
    let leastBusyCount = Infinity;
    for (const employeeId of employeeIds) {
      const count = context.activeCountByUserId.get(employeeId) ?? 0;
      if (count < leastBusyCount) {
        leastBusyCount = count;
        leastBusyId = employeeId;
      }
    }

    if (leastBusyId) {
      bestEmployeeId = leastBusyId;
      bestBreakdown = { skillScore: 0, historyCount: 0, isDepartmentMatch: false, isFallback: true };
    }
  }

  if (!bestEmployeeId) {
    return null;
  }

  const allocationReasons = [];
  if (bestBreakdown.isFallback) {
    allocationReasons.push("No strong skill, history, or department match — assigned to the least busy employee");
  } else {
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
  }

  const allocationKind = bestBreakdown.isFallback
    ? "least_busy"
    : bestBreakdown.skillScore > 0
      ? "skill_match"
      : bestBreakdown.historyCount > 0
        ? "history_pattern"
        : "department_match";

  return { employeeId: bestEmployeeId, allocationReasons, allocationKind };
}

// Called right after an Optimus AI task is inserted (recurring suggestion,
// completion follow-up, allocation-history suggestion, or a task the chat
// agent proposed) so it lands with an assignee in the same request instead
// of waiting for a human to trigger assignment separately — that's what
// keeps AI Allocation Time to real processing time rather than human
// trigger-latency. Also reused by the "Assign with AI" button (tagged
// "ai_assisted" instead of the default "ai_auto"). Pass a `context` (from
// loadAllocationContext) when assigning several tasks in the same batch so
// the org-wide lookups are only fetched once; omitted, it loads its own.
// No-op (task stays unassigned) if nobody can be matched.
async function autoAssignAiTask(supabase, { organizationId, taskId, assignmentMethod = "ai_auto", context }) {
  const ctx = context ?? (await loadAllocationContext(supabase, { organizationId }));
  const match = await pickAiAssigneeWithContext(supabase, ctx, { taskId });
  if (!match) return null;

  const { error: assigneeError } = await supabase
    .from("task_assignee")
    .insert({ task_id: taskId, user_id: match.employeeId });
  if (assigneeError) return null;

  const { data: existingTask } = await supabase
    .from("task")
    .select("assigned_to, reasons")
    .eq("task_id", taskId)
    .maybeSingle();

  await supabase
    .from("task")
    .update({
      assigned_to: existingTask?.assigned_to ?? match.employeeId,
      reasons: {
        ...(existingTask?.reasons ?? {}),
        allocation: match.allocationReasons,
        allocationKind: match.allocationKind,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("task_id", taskId);

  await recordAssignment(supabase, {
    taskId,
    userId: match.employeeId,
    assignedBy: "Optimus AI",
    assignmentMethod,
  });

  ctx.activeCountByUserId.set(match.employeeId, (ctx.activeCountByUserId.get(match.employeeId) ?? 0) + 1);

  return match.employeeId;
}

// Detect a title the manager has recreated at least twice on the same
// weekday (any Mondays, any Wednesdays, ...) — not a strict "exactly 7 days
// apart" interval, just "this keeps landing on the same day of the week" —
// and predict the next occurrence of that weekday as an Optimus AI
// suggestion awaiting Approve/Reject, rather than silently adding a
// committed task. Driven by created_at (always present) rather than
// start_datetime (which most tasks never set), so it isn't limited to the
// handful of tasks someone bothered to schedule explicitly.
// Idempotent: re-running finds a task already dated for that same upcoming
// weekday and skips it, so refreshing repeatedly never creates duplicates —
// once that date passes, the next refresh naturally rolls forward to the
// following week's occurrence instead. Called on demand from the
// "refresh-smart-tasks" action rather than automatically, since there's no
// scheduler in this app.
async function generateRecurringOptimusTasks(supabase, { organizationId, userId }) {
  const { data: orgTasks, error } = await supabase
    .from("task")
    .select("task_id, title, group_id, created_at, start_datetime")
    .eq("organization_id", organizationId);

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayWeekday = today.getDay();

  const recurringTitles = [];

  for (const occurrences of byTitle.values()) {
    if (occurrences.length < 2) continue;

    // Bucket this title's occurrences by weekday-of-creation; a weekday
    // needs 2+ hits to count as "this task's usual day".
    const byWeekday = new Map();
    for (const task of occurrences) {
      const weekday = new Date(task.created_at).getDay();
      const list = byWeekday.get(weekday) ?? [];
      list.push(task);
      byWeekday.set(weekday, list);
    }

    let bestWeekday = null;
    let bestOccurrences = null;
    for (const [weekday, list] of byWeekday) {
      if (list.length < 2) continue;
      if (!bestOccurrences || list.length > bestOccurrences.length) {
        bestWeekday = weekday;
        bestOccurrences = list;
      }
    }
    if (bestWeekday === null) continue;

    const latest = bestOccurrences.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b,
    );
    const latestTime = new Date(latest.created_at);

    // Always the *next* occurrence of that weekday, never today even if
    // today happens to match — this only ever proposes work ahead of time.
    const daysUntil = ((bestWeekday - todayWeekday + 7) % 7) || 7;
    const nextDate = new Date(today.getTime() + daysUntil * ONE_DAY_MS);
    nextDate.setHours(latestTime.getHours(), latestTime.getMinutes(), 0, 0);
    const nextDateKey = nextDate.toISOString().slice(0, 10);

    const alreadyExists = occurrences.some((task) => {
      const candidateDate = task.start_datetime ?? task.created_at;
      return candidateDate && new Date(candidateDate).toISOString().slice(0, 10) === nextDateKey;
    });
    if (alreadyExists) continue;

    const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(nextDate);

    recurringTitles.push({
      title: latest.title,
      groupId: latest.group_id ?? null,
      startDatetime: nextDate.toISOString(),
      endDatetime: null,
      reasons: {
        creation: [`Usually created on ${weekdayName}s (${bestOccurrences.length} times so far) — next one is due`],
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
  const { data: createdTasks, error: insertError } = await supabase
    .from("task")
    .insert(
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
    )
    .select("task_id");

  if (insertError) {
    return 0;
  }

  if ((createdTasks ?? []).length) {
    const context = await loadAllocationContext(supabase, { organizationId });
    for (const createdTask of createdTasks) {
      await autoAssignAiTask(supabase, { organizationId, taskId: createdTask.task_id, context });
    }
  }

  return recurringTitles.length;
}

// Smart Task Creation's on-demand refresh: re-checks recurring patterns for
// anything newly due, then looks at the most recently assigned titles for
// obvious follow-ups — skipping any title that already has an equivalent
// open task so repeat clicks never create duplicates. Everything lands
// pending approval (ai_state "active"), in whichever column the same title
// was last worked in, falling back to "Untitled". Checks every distinct
// title ever allocated (not just the most recent few), so this doesn't
// starve out just because the last handful of titles all happen to still
// be open.
async function refreshSmartTasks(supabase, { organizationId, userId }) {
  const recurringCreated = await generateRecurringOptimusTasks(supabase, { organizationId, userId });

  const historyTitles = await getRecentAllocationTitles(supabase, organizationId);
  const inferredSkillIdsByTitle = await getInferredSkillIdsByTitle(supabase, organizationId, historyTitles);

  const { data: existingTasks } = await supabase
    .from("task")
    .select("title, group_id, status")
    .eq("organization_id", organizationId);

  const openTitles = new Set(
    (existingTasks ?? [])
      .filter((task) => !["completed", "cancelled"].includes(cleanString(task.status).toLowerCase()))
      .map((task) => cleanString(task.title).toLowerCase()),
  );
  const groupIdByTitle = new Map(
    (existingTasks ?? []).map((task) => [cleanString(task.title).toLowerCase(), task.group_id]),
  );

  const candidates = historyTitles
    .map((title) => ({
      title,
      baseTitle: title,
      requiredSkillIds: inferredSkillIdsByTitle.get(title) ?? [],
    }))
    .filter((candidate) => !openTitles.has(candidate.title.toLowerCase()));

  if (!candidates.length) {
    return { recurringCreated, historyCreated: 0 };
  }

  const defaultGroupId = await ensureUntitledGroup(supabase, organizationId);

  const { data: lastTask } = await supabase
    .from("task")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSortOrder = Number.isFinite(Number(lastTask?.sort_order)) ? Number(lastTask.sort_order) + 1 : 0;
  const nowIso = new Date().toISOString();

  const { data: createdTasks, error } = await supabase
    .from("task")
    .insert(
      candidates.map((candidate) => ({
        organization_id: organizationId,
        group_id: groupIdByTitle.get(candidate.baseTitle.toLowerCase()) ?? defaultGroupId,
        title: candidate.title,
        description: "Generated by Optimus AI from allocation history.",
        owner_id: userId,
        assigned_to: null,
        status: "Open",
        priority: "Medium",
        source: "optimus_ai",
        ai_state: "active",
        reasons: {
          creation: [`Analyzed allocation history — "${candidate.baseTitle}" was assigned before`],
          creationKind: "allocation_history",
        },
        sort_order: nextSortOrder++,
        created_at: nowIso,
        updated_at: nowIso,
      })),
    )
    .select("task_id");

  if (error) {
    throw new Error(error.message);
  }

  if ((createdTasks ?? []).length) {
    const context = await loadAllocationContext(supabase, { organizationId });
    for (let index = 0; index < createdTasks.length; index += 1) {
      const skillIds = candidates[index]?.requiredSkillIds;
      if (skillIds?.length) {
        await syncTaskSkills(supabase, createdTasks[index].task_id, skillIds);
      }
      await autoAssignAiTask(supabase, { organizationId, taskId: createdTasks[index].task_id, context });
    }
  }

  return { recurringCreated, historyCreated: candidates.length };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";

    await syncStartedTaskStatuses(supabase, organizationId);

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
    let commentCountByTaskId = new Map();

    if (taskIds.length) {
      const [
        { data: assignments, error: assignmentError },
        { data: skillRows, error: skillError },
        { data: assigneeRows, error: assigneeError },
        { data: commentRows, error: commentError },
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
        supabase.from("task_comment").select("task_id").in("task_id", taskIds),
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

      if (commentError) {
        return NextResponse.json({ error: commentError.message }, { status: 400 });
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

      for (const row of commentRows ?? []) {
        commentCountByTaskId.set(row.task_id, (commentCountByTaskId.get(row.task_id) ?? 0) + 1);
      }
    }

    const visibleTasks = (data ?? []).filter((task) => {
      if (["hidden", "dismissed"].includes(String(task.ai_state || "").toLowerCase())) return false;
      if (includeArchived) return true;

      // Completed and archived tasks belong in Allocation History, not the
      // active Board or Calendar workspace views.
      return !["completed", "archived"].includes(String(task.status || "").toLowerCase());
    });

    const tasks = visibleTasks.map((task) => {
      const latestAssignment = latestAssignmentByTaskId.get(task.task_id);

      return {
        ...task,
        latest_assigned_by: latestAssignment?.assigned_by ?? null,
        latest_assigned_at: latestAssignment?.assigned_at ?? null,
        requiredSkills: requiredSkillsByTaskId.get(task.task_id) ?? [],
        assigneeIds: assigneeIdsByTaskId.get(task.task_id) ?? [],
        comment_count: commentCountByTaskId.get(task.task_id) ?? 0,
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
    let user = getInternalAuthUser(request);

    if (!user) {
      const auth = await getAuthenticatedUser(request, supabase);
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: 403 });
      }

      const managerCheck = await requireManager(request, supabase);
      if (managerCheck.error) {
        return NextResponse.json({ error: managerCheck.error }, { status: 403 });
      }

      user = auth.user;
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

    // Tasks created without a group land in the reserved "Untitled" group
    // (rendered as the board's last column) instead of a silent null group_id.
    const resolvedGroupId = groupId || (await ensureUntitledGroup(supabase, organizationId));

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
        group_id: resolvedGroupId,
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
      if (!(await assertEmployeeAssignee(supabase, organizationId, assignedTo))) {
        return NextResponse.json({ error: "Tasks can only be assigned to Employee accounts." }, { status: 400 });
      }

      const actor = assignedBy || (await getActorName(supabase, user));
      const { error: assigneeError } = await supabase.from("task_assignee").insert({
        task_id: createdTask.task_id,
        user_id: assignedTo,
      });

      if (assigneeError) {
        return NextResponse.json({ error: assigneeError.message }, { status: 400 });
      }

      await recordAssignment(supabase, {
        taskId: createdTask.task_id,
        userId: assignedTo,
        assignedBy: actor,
        assignmentMethod: "task_creation",
      });
    } else if (cleanString(source) === "optimus_ai") {
      // Recurring/agent-proposed tasks never arrive with an assignee —
      // Optimus finds and assigns one itself, right here, so it never sits
      // waiting on a human to trigger assignment separately.
      await autoAssignAiTask(supabase, { organizationId, taskId: createdTask.task_id });
    }

    if (cleanString(source) === "optimus_ai") {
      const isPending = cleanString(aiState).toLowerCase() !== "accepted";
      await notifyAgentOwnerTelegram(supabase, {
        ownerUserId: user.id,
        message: isPending
          ? `🤖 New task recommendation: "${cleanString(title)}" — review and approve it on the board`
          : `🤖 Created task: "${cleanString(title)}"`,
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
    let user = getInternalAuthUser(request);

    if (!user) {
      const managerAuth = await requireManager(request, supabase);
      if (managerAuth.error) {
        return NextResponse.json({ error: managerAuth.error }, { status: 403 });
      }
      user = managerAuth.user;
    }

    const body = await request.json();
    const {
      action,
      tasks,
      taskId,
      taskIds,
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

    // Show/hide pending Optimus AI suggestions on the board (approved tasks
    // are already committed work, so this only affects ones still awaiting
    // Approve/Reject).
    if (action === "set-ai-task-visibility") {
      const isEnabled = Boolean(body.enabled);
      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!organizationId) {
        return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
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

    // Manual trigger for Smart Task Creation: looks at allocation history for
    // due recurring tasks and common-sense follow-ups, skipping anything that
    // already has an equivalent open task so repeat clicks don't pile up
    // duplicates.
    if (action === "refresh-smart-tasks") {
      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!organizationId) {
        return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
      }

      const result = await refreshSmartTasks(supabase, { organizationId, userId: user.id });

      return NextResponse.json({ success: true, ...result });
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

    // Soft-dismiss rather than delete, so a rejected AI suggestion still
    // shows up in acceptance-rate reporting instead of vanishing without a
    // trace. The board's GET already filters ai_state "dismissed" out of the
    // visible list, so this is a no-op from the manager's point of view.
    if (action === "dismiss-ai-task") {
      if (!taskId) {
        return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
      }

      const { error: dismissError } = await supabase
        .from("task")
        .update({ ai_state: "dismissed", updated_at: new Date().toISOString() })
        .eq("task_id", taskId);

      if (dismissError) {
        return NextResponse.json({ error: dismissError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    // Multi-assignee actions: task_assignee holds the full current set of
    // people on a task. assigned_to (single column) is kept as a best-effort
    // "an assignee" mirror so existing allocation-history logic — which only
    // understands a single assignee — keeps working sensibly.
    if (action === "assign-employee") {
      if (!taskId || !userId) {
        return NextResponse.json({ error: "Task ID and user ID are required." }, { status: 400 });
      }

      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!(await assertEmployeeAssignee(supabase, organizationId, userId))) {
        return NextResponse.json({ error: "Tasks can only be assigned to Employee accounts." }, { status: 400 });
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
        await recordAssignment(supabase, { taskId, userId, assignedBy: actor, assignmentMethod: "manual_modal" });
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

    // "Assign with AI" inside the Employee Assignment modal — a manager
    // asking Optimus to pick for an existing task. Same matcher as the
    // automatic at-creation path, so it counts as an AI assignment for the
    // AI-vs-Manual ratio, but tagged "ai_assisted" (not "ai_auto") so it
    // doesn't pollute Allocation Time with however long the manager took to
    // click the button.
    if (action === "ai-assign-task") {
      if (!taskId) {
        return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
      }

      const organizationId = await getManagerOrganizationId(supabase, user);
      if (!organizationId) {
        return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
      }

      const employeeId = await autoAssignAiTask(supabase, { organizationId, taskId, assignmentMethod: "ai_assisted" });

      if (!employeeId) {
        return NextResponse.json(
          { error: "No AI match found — no available employee shares a skill, history, or department signal with this task." },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, employeeId });
    }

    // Reassign creates a fresh copy of a completed/archived task (same
    // title, description, priority, group, and required skills) and hands
    // it to whoever had it before — "do this again" from Allocation
    // History, not editing history in place. The target is always resolved
    // from the task's own prior assignee/allocation record and re-verified
    // as an Employee-role account via assertEmployeeAssignee — it is never
    // the authenticated caller, so a manager clicking Reassign can't end up
    // assigning the task to themselves (or, if a task was ever incorrectly
    // left assigned to a Manager/User Admin/Platform Admin account, that
    // task is skipped rather than propagating the bad assignee forward).
    if (action === "reassign-task") {
      const targetTaskIds = Array.isArray(taskIds) && taskIds.length ? taskIds : taskId ? [taskId] : [];

      if (!targetTaskIds.length) {
        return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
      }

      const { data: originalTasks, error: fetchError } = await supabase
        .from("task")
        .select("task_id, organization_id, group_id, title, description, priority, assigned_to")
        .in("task_id", targetTaskIds);

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 400 });
      }

      const { data: skillRows } = await supabase
        .from("task_skill")
        .select("task_id, skill_id")
        .in("task_id", targetTaskIds);
      const skillIdsByTask = new Map();
      for (const row of skillRows ?? []) {
        if (!skillIdsByTask.has(row.task_id)) skillIdsByTask.set(row.task_id, []);
        skillIdsByTask.get(row.task_id).push(row.skill_id);
      }

      const actor = await getActorName(supabase, user);
      const createdTaskIds = [];
      let skippedCount = 0;

      for (const original of originalTasks ?? []) {
        // Fall back to the most recent allocation-history entry when
        // assigned_to is empty (e.g. the task was later unassigned) —
        // either way, the candidate still has to pass the Employee check.
        // assigned_to alone isn't trusted even when present: the previous
        // bug this replaces could have already left it pointing at a
        // Manager/Admin (from an old "reassign to myself" click), so an
        // invalid value here also falls through to full history — not just
        // a missing one — walking newest-first past any corrupted entries
        // until a real Employee assignment turns up.
        let previousEmployeeId = original.assigned_to;
        let hasValidEmployee = await assertEmployeeAssignee(supabase, original.organization_id, previousEmployeeId);

        if (!hasValidEmployee) {
          const { data: assignmentHistory } = await supabase
            .from("task_assignment")
            .select("user_id")
            .eq("task_id", original.task_id)
            .order("assigned_at", { ascending: false });

          const candidateIds = [...new Set((assignmentHistory ?? []).map((row) => row.user_id).filter(Boolean))];
          const validIds = new Set();
          if (candidateIds.length) {
            const { data: candidateAccounts } = await supabase
              .from("user_account")
              .select("user_id, role:role_id(role_name)")
              .in("user_id", candidateIds)
              .eq("organization_id", original.organization_id);
            for (const account of candidateAccounts ?? []) {
              if (isEmployeeRole(account.role?.role_name)) validIds.add(account.user_id);
            }
          }

          for (const row of assignmentHistory ?? []) {
            if (validIds.has(row.user_id)) {
              previousEmployeeId = row.user_id;
              hasValidEmployee = true;
              break;
            }
          }
        }

        if (!hasValidEmployee) {
          skippedCount += 1;
          continue;
        }

        const resolvedGroupId =
          original.group_id || (await ensureUntitledGroup(supabase, original.organization_id));

        const { data: lastTask } = await supabase
          .from("task")
          .select("sort_order")
          .eq("organization_id", original.organization_id)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSortOrder = Number.isFinite(Number(lastTask?.sort_order)) ? Number(lastTask.sort_order) + 1 : 0;

        const { data: createdTask, error: createError } = await supabase
          .from("task")
          .insert({
            organization_id: original.organization_id,
            group_id: resolvedGroupId,
            title: original.title,
            description: original.description,
            owner_id: user.id,
            assigned_to: previousEmployeeId,
            status: "Open",
            priority: original.priority,
            source: "manual",
            reasons: { creation: [`Reassigned from a previous allocation by ${actor}.`], creationKind: "reassignment" },
            sort_order: nextSortOrder,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("task_id")
          .single();

        if (createError) {
          skippedCount += 1;
          continue;
        }

        const skillIds = skillIdsByTask.get(original.task_id) ?? [];
        if (skillIds.length) {
          await syncTaskSkills(supabase, createdTask.task_id, skillIds);
        }

        await supabase.from("task_assignee").insert({ task_id: createdTask.task_id, user_id: previousEmployeeId });
        await recordAssignment(supabase, {
          taskId: createdTask.task_id,
          userId: previousEmployeeId,
          assignedBy: actor,
          assignmentMethod: "manual_modal",
        });

        createdTaskIds.push(createdTask.task_id);
      }

      if (!createdTaskIds.length) {
        return NextResponse.json(
          { error: "Could not reassign — none of the selected tasks have a valid Employee to reassign to." },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true, reassignedCount: createdTaskIds.length, skippedCount });
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

    // Fetched up front (rather than after building taskUpdates) so a
    // requested group change can be validated against the task's current
    // approval state before it's applied.
    const { data: existingTask } = await supabase
      .from("task")
      .select("assigned_to, source, ai_state, group_id, title, status, owner_id")
      .eq("task_id", taskId)
      .maybeSingle();

    if (!existingTask) {
      // Supabase's update() below wouldn't itself error on a missing row (it
      // just matches zero rows) — without this check, execution would fall
      // through to syncTaskSkills and crash on a foreign-key violation
      // trying to insert task_skill rows for a task_id that no longer
      // exists (e.g. deleted concurrently, or from another tab).
      return NextResponse.json({ error: "This task no longer exists — it may have been deleted." }, { status: 404 });
    }

    const isChangingGroup = groupId !== undefined && String(groupId ?? "") !== String(existingTask?.group_id ?? "");

    if (isChangingGroup) {
      const isPendingAiTask =
        existingTask?.source === "optimus_ai" &&
        !["accepted", "dismissed"].includes(String(existingTask?.ai_state || "").toLowerCase());

      if (isPendingAiTask) {
        return NextResponse.json(
          { error: "Approve this AI-generated task before moving it to a different group." },
          { status: 400 },
        );
      }
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
      if (assignedTo) {
        const organizationId = await getManagerOrganizationId(supabase, user);
        if (!(await assertEmployeeAssignee(supabase, organizationId, assignedTo))) {
          return NextResponse.json({ error: "Tasks can only be assigned to Employee accounts." }, { status: 400 });
        }
      }
      taskUpdates.assigned_to = assignedTo || null;
    }
    // Only change the group when explicitly provided (move between groups).
    // Clearing it back to "no group" lands the task in "Untitled" rather than
    // a bare null group_id.
    if (groupId !== undefined) {
      taskUpdates.group_id = groupId || (await ensureUntitledGroup(supabase, await getManagerOrganizationId(supabase, user)));
    }

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
      await recordAssignment(supabase, { taskId, userId: assignedTo, assignedBy: actor, assignmentMethod: "manual_modal" });
    }

    if (existingTask?.status && taskUpdates.status && existingTask.status !== taskUpdates.status) {
      await notifyAgentOwnerTelegram(supabase, {
        ownerUserId: existingTask.owner_id,
        message: `📋 "${existingTask.title}" moved from ${existingTask.status} to ${taskUpdates.status}`,
      });
    }

    const isCompletingNow = existingTask?.status !== "Completed" && cleanString(status) === "Completed";
    if (isCompletingNow && existingTask?.title) {
      // Best-effort — a follow-up suggestion is a nice-to-have, never worth
      // failing the "mark complete" action over.
      await generateCompletionFollowUpTask(supabase, {
        organizationId: await getManagerOrganizationId(supabase, user),
        userId: user.id,
        completedTitle: existingTask.title,
        groupId: existingTask.group_id,
      }).catch(() => {});
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
