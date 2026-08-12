import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const REPORTING_TIME_ZONE = "Asia/Singapore";

function dateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function currentDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// periodOffset 0 = the current week/month, -1 = the one immediately before
// it — used to build a comparison baseline for the "% from last week/month"
// headline stat without a second round-trip to the DB (both periods are
// checked against the same already-fetched completion data).
function buildBuckets(range, periodOffset = 0) {
  const { year, month, day } = currentDateParts();

  if (range === "month") {
    const shifted = new Date(Date.UTC(year, month - 1 + periodOffset, 1, 12));
    const shiftedYear = shifted.getUTCFullYear();
    const shiftedMonth = shifted.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate();

    return Array.from({ length: 5 }, (_, index) => {
      const startDay = index * 7 + 1;
      const numDays = Math.max(0, Math.min(7, daysInMonth - index * 7));
      const endDay = startDay + numDays - 1;
      return {
        // "1–7" instead of "Week 1" — the actual calendar days a bucket
        // covers, not a generic ordinal that needs the month figured out
        // separately.
        label: numDays > 0 ? `${startDay}–${endDay}` : null,
        keys: Array.from({ length: numDays }, (__, offset) =>
          dateKey(new Date(Date.UTC(shiftedYear, shiftedMonth - 1, startDay + offset, 12))),
        ),
      };
    }).filter((bucket) => bucket.label);
  }

  const today = new Date(Date.UTC(year, month - 1, day, 12));
  const shiftedToday = addUtcDays(today, periodOffset * 7);
  const mondayOffset = (shiftedToday.getUTCDay() + 6) % 7;
  const monday = addUtcDays(shiftedToday, -mondayOffset);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, index) => ({
    label,
    keys: [dateKey(addUtcDays(monday, index))],
  }));
}

function countCompletedForKeys(firstCompletionByTask, keySet) {
  let count = 0;
  for (const [, completedAt] of firstCompletionByTask) {
    if (keySet.has(dateKey(completedAt))) count += 1;
  }
  return count;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);

    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const range = new URL(request.url).searchParams.get("range") === "month" ? "month" : "week";
    const buckets = buildBuckets(range, 0);
    const previousBuckets = buildBuckets(range, -1);

    if (!organizationId) {
      return NextResponse.json({
        range,
        points: buckets.map(({ label }) => ({ label, completed: 0, beforeDeadline: 0, overdue: 0 })),
        summary: { totalCompleted: 0, percentChange: 0 },
      });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("task")
      .select("task_id, status, end_datetime, updated_at")
      .eq("organization_id", organizationId);

    if (tasksError) return NextResponse.json({ error: tasksError.message }, { status: 400 });

    const taskIds = (tasks ?? []).map((task) => task.task_id);
    let completionRows = [];

    if (taskIds.length) {
      const { data, error } = await supabase
        .from("task_history")
        .select("task_id, changed_at")
        .in("task_id", taskIds)
        .ilike("to_status", "completed")
        .order("changed_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      completionRows = data ?? [];
    }

    const taskById = new Map((tasks ?? []).map((task) => [task.task_id, task]));
    const firstCompletionByTask = new Map();
    for (const row of completionRows) {
      if (!firstCompletionByTask.has(row.task_id)) firstCompletionByTask.set(row.task_id, row.changed_at);
    }

    // Older completed tasks may predate task_history; updated_at is the best
    // available completion-time fallback for those records.
    for (const task of tasks ?? []) {
      if (
        String(task.status || "").toLowerCase() === "completed" &&
        !firstCompletionByTask.has(task.task_id) &&
        task.updated_at
      ) {
        firstCompletionByTask.set(task.task_id, task.updated_at);
      }
    }

    const now = Date.now();
    const points = buckets.map(({ label, keys }) => {
      const keySet = new Set(keys);
      let completed = 0;
      let beforeDeadline = 0;
      let overdue = 0;

      for (const [taskId, completedAt] of firstCompletionByTask) {
        if (!keySet.has(dateKey(completedAt))) continue;
        completed += 1;
        const deadline = taskById.get(taskId)?.end_datetime;
        if (deadline && new Date(completedAt).getTime() <= new Date(deadline).getTime()) beforeDeadline += 1;
      }

      for (const task of tasks ?? []) {
        const isComplete = firstCompletionByTask.has(task.task_id);
        if (
          !isComplete &&
          task.end_datetime &&
          new Date(task.end_datetime).getTime() < now &&
          keySet.has(dateKey(task.end_datetime))
        ) {
          overdue += 1;
        }
      }

      return { label, completed, beforeDeadline, overdue };
    });

    const totalCompleted = points.reduce((sum, point) => sum + point.completed, 0);
    const previousKeySet = new Set(previousBuckets.flatMap((bucket) => bucket.keys));
    const previousCompleted = countCompletedForKeys(firstCompletionByTask, previousKeySet);
    const percentChange = previousCompleted > 0
      ? Math.round(((totalCompleted - previousCompleted) / previousCompleted) * 100)
      : totalCompleted > 0
        ? 100
        : 0;

    return NextResponse.json({ range, points, summary: { totalCompleted, percentChange } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
