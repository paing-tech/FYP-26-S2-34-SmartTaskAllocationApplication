import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// A task that sat unassigned for a long stretch before finally getting
// picked up (an old backlog task, or a manager circling back much later)
// isn't a fair measure of allocation speed — excluded from the average
// rather than letting one outlier dominate it. Not silently dropped:
// excludedOutlierCount reports how many were cut, per bucket.
const OUTLIER_THRESHOLD_MINUTES = 60;

// Allocation Time only counts the assignment method each bucket actually
// claims credit for: "ai_auto" for Smart Allocation (Optimus AI/the chat
// agent assigning the task itself, at creation) and "manual_modal" for
// Manual (a human picking someone later via the Employee Assignment modal).
// Tasks assigned inline at creation ("task_creation") aren't a real search
// for a person — they're excluded from timing on both sides, though they
// still count toward Allocation Accuracy and Skill Match Rate.
function summarizeBucket(tasks, timingMethod) {
  const taskCount = tasks.length;
  const timingEligible = tasks.filter(
    (task) => task.assignmentMethod === timingMethod && task.minutesToAssign != null && task.minutesToAssign >= 0,
  );
  const timesToAssignMinutes = timingEligible
    .map((task) => task.minutesToAssign)
    .filter((minutes) => minutes <= OUTLIER_THRESHOLD_MINUTES);
  const reassignedCount = tasks.filter((task) => task.assignmentCount > 1).length;
  const skillApplicableTasks = tasks.filter((task) => task.skillMatched != null);
  const skillMatchedCount = skillApplicableTasks.filter((task) => task.skillMatched).length;

  return {
    taskCount,
    averageMinutesToAssign: average(timesToAssignMinutes),
    excludedOutlierCount: timingEligible.length - timesToAssignMinutes.length,
    firstTimeAccuracy: taskCount ? 1 - reassignedCount / taskCount : null,
    skillMatchRate: skillApplicableTasks.length ? skillMatchedCount / skillApplicableTasks.length : null,
  };
}

// How many tasks were created by AI (source "optimus_ai": recurring
// suggestions, completion follow-ups, allocation-history suggestions, or
// the chat agent) vs. everything else — a separate concern from who
// *assigned* a task, so this can be tracked alongside allocation counts as
// a "reliance on AI" signal over time.
function summarizeTaskSource(tasks) {
  const aiCreated = tasks.filter((task) => task.source === "optimus_ai").length;
  return { aiCreated, manualCreated: tasks.length - aiCreated };
}

// Rolling window (week or month) counts for Allocation, Creation, and AI
// Suggestion acceptance — a snapshot of recent behavior rather than an
// all-time total, so it reflects current reliance on AI (the "Allocation
// Preference" card) instead of getting diluted by however long the org has
// been using the tool.
function summarizeRangeCounts(tasks, assignmentsByTaskId, cutoffMs) {
  const counts = {
    allocation: { ai: 0, manual: 0 },
    creation: { ai: 0, manual: 0 },
    acceptance: { accepted: 0, total: 0 },
  };

  for (const task of tasks) {
    if (new Date(task.created_at).getTime() >= cutoffMs) {
      if (task.source === "optimus_ai") {
        counts.creation.ai += 1;
        counts.acceptance.total += 1;
        if (String(task.ai_state || "").toLowerCase() === "accepted") {
          counts.acceptance.accepted += 1;
        }
      } else {
        counts.creation.manual += 1;
      }
    }

    const firstAssignment = (assignmentsByTaskId.get(task.task_id) ?? [])[0];
    if (firstAssignment && new Date(firstAssignment.assigned_at).getTime() >= cutoffMs) {
      if (firstAssignment.assigned_by === "Optimus AI") counts.allocation.ai += 1;
      else counts.allocation.manual += 1;
    }
  }

  return counts;
}

// The chat-agent "Auto-approve" path stamps reasons.approvedBy with the
// agent's own display name at creation time — that's the one reliable way
// to tell "approved itself" apart from "a manager reviewed and approved it
// later" (which stamps a real person's name instead), since both end up
// with the same ai_state "accepted".
function summarizeAiSuggestions(tasks) {
  const suggestions = tasks.filter((task) => task.source === "optimus_ai");
  const total = suggestions.length;
  let autoApproved = 0;
  let managerApproved = 0;
  let dismissed = 0;

  for (const task of suggestions) {
    const state = String(task.ai_state || "").toLowerCase();
    if (state === "dismissed") {
      dismissed += 1;
    } else if (state === "accepted") {
      const agentName = task.reasons?.agentName;
      if (agentName && task.reasons?.approvedBy === agentName) {
        autoApproved += 1;
      } else {
        managerApproved += 1;
      }
    }
  }

  return {
    total,
    managerApproved,
    autoApproved,
    dismissed,
    managerApprovedRate: total ? managerApproved / total : null,
    autoApprovedRate: total ? autoApproved / total : null,
    dismissedRate: total ? dismissed / total : null,
  };
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const rangeWindow = new URL(request.url).searchParams.get("range") === "month" ? "month" : "week";
    const rangeDays = rangeWindow === "month" ? 30 : 7;
    const rangeCutoffMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

    if (!organizationId) {
      return NextResponse.json({
        ai: summarizeBucket([], "ai_auto"),
        manual: summarizeBucket([], "manual_modal"),
        aiSuggestions: summarizeAiSuggestions([]),
        taskSource: summarizeTaskSource([]),
        range: { window: rangeWindow, ...summarizeRangeCounts([], new Map(), rangeCutoffMs) },
      });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("task")
      .select("task_id, status, created_at, source, ai_state, reasons")
      .eq("organization_id", organizationId);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    const taskIds = (tasks ?? []).map((task) => task.task_id);
    let assignmentsByTaskId = new Map();
    let requiredSkillsByTaskId = new Map();

    if (taskIds.length) {
      const [{ data: assignments, error: assignmentsError }, { data: taskSkills, error: taskSkillsError }] =
        await Promise.all([
          supabase
            .from("task_assignment")
            .select("task_id, assigned_by, assigned_at, user_id, assignment_method")
            .in("task_id", taskIds)
            .order("assigned_at", { ascending: true }),
          supabase.from("task_skill").select("task_id, skill_id").in("task_id", taskIds),
        ]);

      if (assignmentsError) {
        return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
      }
      if (taskSkillsError) {
        return NextResponse.json({ error: taskSkillsError.message }, { status: 400 });
      }

      for (const assignment of assignments ?? []) {
        const list = assignmentsByTaskId.get(assignment.task_id) ?? [];
        list.push(assignment);
        assignmentsByTaskId.set(assignment.task_id, list);
      }

      for (const row of taskSkills ?? []) {
        const list = requiredSkillsByTaskId.get(row.task_id) ?? [];
        list.push(row.skill_id);
        requiredSkillsByTaskId.set(row.task_id, list);
      }
    }

    const firstAssigneeIds = [
      ...new Set(
        [...assignmentsByTaskId.values()].map((assignments) => assignments[0]?.user_id).filter(Boolean),
      ),
    ];
    let skillIdsByUserId = new Map();

    if (firstAssigneeIds.length) {
      const { data: userSkills, error: userSkillsError } = await supabase
        .from("user_skill")
        .select("user_id, skill_id")
        .in("user_id", firstAssigneeIds);

      if (userSkillsError) {
        return NextResponse.json({ error: userSkillsError.message }, { status: 400 });
      }

      for (const row of userSkills ?? []) {
        const set = skillIdsByUserId.get(row.user_id) ?? new Set();
        set.add(row.skill_id);
        skillIdsByUserId.set(row.user_id, set);
      }
    }

    const aiTasks = [];
    const manualTasks = [];

    for (const task of tasks ?? []) {
      const assignments = assignmentsByTaskId.get(task.task_id) ?? [];
      if (!assignments.length) continue; // unassigned tasks don't belong to either bucket

      const firstAssignment = assignments[0];
      const minutesToAssign =
        (new Date(firstAssignment.assigned_at).getTime() - new Date(task.created_at).getTime()) / 60000;

      const requiredSkillIds = requiredSkillsByTaskId.get(task.task_id) ?? [];
      const assigneeSkillIds = skillIdsByUserId.get(firstAssignment.user_id) ?? new Set();
      const skillMatched = requiredSkillIds.length
        ? requiredSkillIds.some((skillId) => assigneeSkillIds.has(skillId))
        : null; // no requirement recorded — not applicable to the skill-match rate

      const enrichedTask = {
        assignmentCount: assignments.length,
        minutesToAssign,
        assignmentMethod: firstAssignment.assignment_method,
        skillMatched,
      };

      if (firstAssignment.assigned_by === "Optimus AI") {
        aiTasks.push(enrichedTask);
      } else {
        manualTasks.push(enrichedTask);
      }
    }

    return NextResponse.json({
      ai: summarizeBucket(aiTasks, "ai_auto"),
      manual: summarizeBucket(manualTasks, "manual_modal"),
      aiSuggestions: summarizeAiSuggestions(tasks ?? []),
      taskSource: summarizeTaskSource(tasks ?? []),
      range: {
        window: rangeWindow,
        ...summarizeRangeCounts(tasks ?? [], assignmentsByTaskId, rangeCutoffMs),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
