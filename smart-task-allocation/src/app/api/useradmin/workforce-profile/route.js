import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Monday-start week containing `date`.
function startOfWeek(date) {
  const day = date.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return addDays(date, -mondayOffset);
}

function hoursForRecord(record, now) {
  const endMs = record.clock_out_at ? new Date(record.clock_out_at).getTime() : now.getTime();
  return Math.max(0, (endMs - new Date(record.clock_in_at).getTime()) / 3600000);
}

// One combined profile snapshot for the Workforce page's selected
// manager/employee — Employee Card, Work Hours, Attendance Rate, and Leave
// Balance all read from one response instead of four separate round trips,
// since an admin viewing one person's page wants all of it at once anyway.
export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    if (!organizationId) return NextResponse.json({ error: "You must belong to an organization." }, { status: 400 });

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get("userId");
    if (!targetUserId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
    // Only the period-summable stats (Present/Absent/Late/Attendance Rate,
    // Completed/Created, Work Hours, Overtime) respect this — snapshot
    // numbers (Overdue, In Progress, Leave Balance) are the same either way.
    const range = url.searchParams.get("range") === "month" ? "month" : "week";

    const { data: account, error: accountError } = await supabase
      .from("user_account")
      .select(
        "user_id, organization_id, role:role_id(role_name), department:department_id(department_name)",
      )
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 400 });
    // Not this org's account — refuse rather than leak another org's data.
    if (!account || account.organization_id !== organizationId) {
      return NextResponse.json({ error: "That person could not be found in your organization." }, { status: 404 });
    }
    const isManager = String(account.role?.role_name || "").toLowerCase() === "manager";

    const now = new Date();
    const yearStart = `${now.getUTCFullYear()}-01-01`;
    const yearEnd = `${now.getUTCFullYear() + 1}-01-01`;
    const weekStart = startOfWeek(now);
    const weekDateStrs = new Set(Array.from({ length: 7 }, (_, index) => toDateStr(addDays(weekStart, index))));
    const currentMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
    const rangeStartMs = range === "month" ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) : weekStart.getTime();

    const [
      { data: profile, error: profileError },
      { data: workPolicy, error: workPolicyError },
      { data: leavePolicy, error: leavePolicyError },
      { data: attendanceRows, error: attendanceError },
      { data: scheduleRows, error: scheduleError },
      { data: leaveRequests, error: leaveRequestsError },
      { data: orgTasks, error: orgTasksError },
      { data: assigneeRows, error: assigneeRowsError },
    ] = await Promise.all([
      supabase.from("profile").select("full_name, job_title, profile_picture_url").eq("user_id", targetUserId).maybeSingle(),
      supabase.from("organization").select("weekly_hour_limit").eq("organization_id", organizationId).maybeSingle(),
      supabase
        .from("organization")
        .select("annual_leave_total, sick_leave_total")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("attendance")
        .select("work_date, clock_in_at, clock_out_at, late_minutes, overtime_minutes")
        .eq("user_id", targetUserId)
        .gte("work_date", yearStart)
        .lt("work_date", yearEnd),
      supabase
        .from("attendance_schedule")
        .select("work_date")
        .eq("user_id", targetUserId)
        .gte("work_date", yearStart)
        .lt("work_date", yearEnd),
      supabase.from("leave_request").select("leave_type, dates, status").eq("user_id", targetUserId),
      supabase
        .from("task")
        .select("task_id, status, end_datetime, updated_at, created_at, assigned_to, owner_id, source")
        .eq("organization_id", organizationId),
      supabase.from("task_assignee").select("task_id").eq("user_id", targetUserId),
    ]);

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    if (workPolicyError) return NextResponse.json({ error: workPolicyError.message }, { status: 400 });
    if (leavePolicyError) return NextResponse.json({ error: leavePolicyError.message }, { status: 400 });
    if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 400 });
    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 400 });
    if (leaveRequestsError) return NextResponse.json({ error: leaveRequestsError.message }, { status: 400 });
    if (orgTasksError) return NextResponse.json({ error: orgTasksError.message }, { status: 400 });
    if (assigneeRowsError) return NextResponse.json({ error: assigneeRowsError.message }, { status: 400 });

    // --- Work Hours (this week / this month, both kept so the toggle can
    // switch without a second round trip) ---
    let weekHours = 0;
    let weekOvertimeMinutes = 0;
    let monthHours = 0;
    let monthOvertimeMinutes = 0;

    for (const record of attendanceRows ?? []) {
      if (!record.clock_in_at) continue;
      const dateStr = record.work_date;
      const hours = hoursForRecord(record, now);
      if (weekDateStrs.has(dateStr)) {
        weekHours += hours;
        if (record.overtime_minutes > 0) weekOvertimeMinutes += record.overtime_minutes;
      }
      if (dateStr.startsWith(currentMonth)) {
        monthHours += hours;
        if (record.overtime_minutes > 0) monthOvertimeMinutes += record.overtime_minutes;
      }
    }

    // --- Attendance Rate (12 months, current year — for the chart, always
    // full-year regardless of the range toggle) ---
    const scheduledByMonth = Array.from({ length: 12 }, () => new Set());
    for (const row of scheduleRows ?? []) {
      const monthIndex = Number(row.work_date.slice(5, 7)) - 1;
      scheduledByMonth[monthIndex].add(row.work_date);
    }

    const attendedByMonth = Array.from({ length: 12 }, () => new Set());
    const lateCountByMonth = Array(12).fill(0);
    for (const record of attendanceRows ?? []) {
      if (!record.clock_in_at) continue;
      const monthIndex = Number(record.work_date.slice(5, 7)) - 1;
      attendedByMonth[monthIndex].add(record.work_date);
      if (record.late_minutes > 0) lateCountByMonth[monthIndex] += 1;
    }

    const rates = MONTH_LABELS.map((_, index) => {
      const scheduled = scheduledByMonth[index];
      if (scheduled.size === 0) return 0;
      const attended = attendedByMonth[index];
      let attendedScheduledDays = 0;
      for (const dateStr of scheduled) {
        if (attended.has(dateStr)) attendedScheduledDays += 1;
      }
      return Math.min(100, Math.round((attendedScheduledDays / scheduled.size) * 100));
    });
    const scheduledMonths = scheduledByMonth.map((set) => set.size > 0);

    // --- Attendance summary (Present/Absent/Late/Rate for the selected
    // range — week uses weekDateStrs, month reuses the per-month sets
    // already built above) ---
    const currentMonthIndex = now.getUTCMonth();
    let rangeScheduled;
    let rangeAttended;
    let rangeLate;

    if (range === "month") {
      rangeScheduled = scheduledByMonth[currentMonthIndex];
      rangeAttended = attendedByMonth[currentMonthIndex];
      rangeLate = lateCountByMonth[currentMonthIndex];
    } else {
      rangeScheduled = new Set([...scheduleRows ?? []].map((row) => row.work_date).filter((date) => weekDateStrs.has(date)));
      rangeAttended = new Set(
        (attendanceRows ?? []).filter((record) => record.clock_in_at && weekDateStrs.has(record.work_date)).map((record) => record.work_date),
      );
      rangeLate = (attendanceRows ?? []).filter((record) => record.late_minutes > 0 && weekDateStrs.has(record.work_date)).length;
    }

    const presentDays = rangeAttended.size;
    let absentDays = 0;
    for (const dateStr of rangeScheduled) {
      if (!rangeAttended.has(dateStr)) absentDays += 1;
    }
    const attendanceRatePercent = rangeScheduled.size
      ? Math.round((([...rangeScheduled].filter((date) => rangeAttended.has(date))).length / rangeScheduled.size) * 100)
      : null;

    // --- Leave Balance (always the current year — annual entitlements
    // don't have a meaningful week/month version) ---
    const currentYear = now.getUTCFullYear();
    const usedDays = { annual: 0, sick: 0 };
    for (const record of leaveRequests ?? []) {
      const type = record.leave_type === "sick" ? "sick" : "annual";
      const daysThisYear = (record.dates ?? []).filter(
        (dateStr) => new Date(dateStr).getUTCFullYear() === currentYear,
      ).length;
      usedDays[type] += daysThisYear;
    }

    // Individual leave-day entries for the Leave Records list — only
    // approved leave, one entry per calendar day (a single request can
    // span several non-contiguous dates), most recent first.
    const leaveRecords = (leaveRequests ?? [])
      .filter((record) => record.status === "Approved")
      .flatMap((record) => (record.dates ?? []).map((date) => ({ type: record.leave_type === "sick" ? "sick" : "annual", date })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const nowMs = now.getTime();
    let productivity;

    if (isManager) {
      // --- Manager view: tasks they created (manual vs AI-assisted) and
      // assignments they've made — not tasks assigned *to* them, since a
      // manager's own execution queue isn't the meaningful "productivity"
      // signal for that role the way it is for an employee. ---
      const createdTasks = (orgTasks ?? []).filter((task) => task.owner_id === targetUserId);
      const createdInRange = createdTasks.filter((task) => new Date(task.created_at).getTime() >= rangeStartMs);
      const createdManually = createdInRange.filter((task) => task.source !== "optimus_ai").length;
      const createdViaAi = createdInRange.filter((task) => task.source === "optimus_ai").length;

      const orgTaskIds = (orgTasks ?? []).map((task) => task.task_id);
      let assignmentRows = [];
      if (orgTaskIds.length) {
        const { data, error: assignmentError } = await supabase
          .from("task_assignment")
          .select("task_id, assigned_by, assigned_at")
          .in("task_id", orgTaskIds);
        if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 400 });
        assignmentRows = data ?? [];
      }
      // assigned_by stores a display name, not a user_id — same convention
      // /api/insights/allocation-efficiency already relies on for "Optimus
      // AI" vs a person's name.
      const fullName = profile?.full_name || "";
      const taskAssignments = assignmentRows.filter(
        (row) => row.assigned_by === fullName && new Date(row.assigned_at).getTime() >= rangeStartMs,
      ).length;

      productivity = {
        role: "manager",
        tasksCreated: createdInRange.length,
        createdManually,
        createdViaAi,
        taskAssignments,
      };
    } else {
      // --- Employee view: tasks assigned to them (unchanged from before). ---
      const assignedTaskIds = new Set([
        ...(assigneeRows ?? []).map((row) => row.task_id),
        ...(orgTasks ?? []).filter((task) => task.assigned_to === targetUserId).map((task) => task.task_id),
      ]);
      const personTasks = (orgTasks ?? []).filter((task) => assignedTaskIds.has(task.task_id));
      const personTaskIds = personTasks.map((task) => task.task_id);

      let completionRows = [];
      if (personTaskIds.length) {
        const { data, error: completionError } = await supabase
          .from("task_history")
          .select("task_id, changed_at")
          .in("task_id", personTaskIds)
          .ilike("to_status", "completed")
          .order("changed_at", { ascending: true });
        if (completionError) return NextResponse.json({ error: completionError.message }, { status: 400 });
        completionRows = data ?? [];
      }

      // Older completed tasks may predate task_history; updated_at is the
      // best available completion-time fallback for those (same approach as
      // /api/insights/productivity-trends).
      const firstCompletionByTask = new Map();
      for (const row of completionRows) {
        if (!firstCompletionByTask.has(row.task_id)) firstCompletionByTask.set(row.task_id, row.changed_at);
      }
      for (const task of personTasks) {
        if (String(task.status || "").toLowerCase() === "completed" && !firstCompletionByTask.has(task.task_id) && task.updated_at) {
          firstCompletionByTask.set(task.task_id, task.updated_at);
        }
      }

      let totalCompleted = 0;
      let completedInRange = 0;
      let completedOnTime = 0;
      let overdueTasks = 0;
      for (const task of personTasks) {
        const completedAt = firstCompletionByTask.get(task.task_id);
        if (completedAt) {
          totalCompleted += 1;
          if (new Date(completedAt).getTime() >= rangeStartMs) completedInRange += 1;
          if (task.end_datetime && new Date(completedAt).getTime() <= new Date(task.end_datetime).getTime()) {
            completedOnTime += 1;
          }
        } else if (task.end_datetime && new Date(task.end_datetime).getTime() < nowMs) {
          overdueTasks += 1;
        }
      }

      productivity = {
        role: "employee",
        totalAssigned: personTasks.length,
        totalCompleted: completedInRange,
        completedOnTime,
        overdueTasks,
        inProgress: Math.max(0, personTasks.length - totalCompleted - overdueTasks),
      };
    }

    return NextResponse.json({
      range,
      person: {
        userId: targetUserId,
        fullName: profile?.full_name || "Unnamed",
        jobTitle: profile?.job_title || null,
        departmentName: account.department?.department_name || null,
        roleName: account.role?.role_name || null,
        avatarUrl: profile?.profile_picture_url ?? null,
      },
      // weekHours/monthHours (and their overtime) are both included
      // unconditionally — the Work Hours donut card shows both at once
      // regardless of the range toggle, which only affects the
      // Productivity stat list's single Work Hours/Overtime rows below.
      workHours: {
        weekHours,
        weekOvertimeMinutes,
        monthHours,
        monthOvertimeMinutes,
        weeklyHourLimit: workPolicy?.weekly_hour_limit ?? 40,
      },
      attendanceRate: {
        rates,
        lateCounts: lateCountByMonth,
        scheduledMonths,
      },
      attendanceSummary: {
        presentDays,
        absentDays,
        lateArrivals: rangeLate,
        attendanceRatePercent,
      },
      leaveBalance: {
        totals: {
          annual: leavePolicy?.annual_leave_total ?? 16,
          sick: leavePolicy?.sick_leave_total ?? 14,
        },
        used: usedDays,
        records: leaveRecords,
      },
      productivity,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
