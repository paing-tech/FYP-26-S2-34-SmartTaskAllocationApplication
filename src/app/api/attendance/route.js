import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Face verification (face-api.js) runs entirely client-side in the browser —
// this app has no ML backend. The server only trusts the "verified" flag the
// client reports and stores the distance score alongside it for audit; it
// does not re-run face comparison itself.

async function getMyAccountId(supabase, user) {
  const byId = await supabase.from("user_account").select("user_id").eq("user_id", user.id).maybeSingle();
  if (byId.error || byId.data) {
    return { userId: byId.data?.user_id, error: byId.error };
  }

  const byEmail = await supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();
  return { userId: byEmail.data?.user_id, error: byEmail.error };
}

function scheduledDate(workDate, time, addDay = false) {
  const value = new Date(`${workDate}T${String(time).slice(0, 8).padEnd(8, ":00")}Z`);
  if (addDay) value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

async function loadClockWindow(supabase, userId, workDate) {
  const { data: schedule } = await supabase
    .from("attendance_schedule")
    .select("work_date, start_time, end_time")
    .eq("user_id", userId)
    .eq("work_date", workDate)
    .maybeSingle();

  const { data: assigneeRows } = await supabase.from("task_assignee").select("task_id").eq("user_id", userId);
  const assignedTaskIds = (assigneeRows ?? []).map((row) => row.task_id);
  let taskQuery = supabase
    .from("task")
    .select("task_id, title, status, assigned_to, start_datetime, end_datetime")
    .not("status", "in", "(Completed,Cancelled,Archived)");
  if (assignedTaskIds.length) {
    taskQuery = taskQuery.or(`assigned_to.eq.${userId},task_id.in.(${assignedTaskIds.join(",")})`);
  } else {
    taskQuery = taskQuery.eq("assigned_to", userId);
  }
  const { data: tasks } = await taskQuery;
  const task = (tasks ?? []).find((row) => String(row.start_datetime || "").slice(0, 10) === workDate) ?? null;

  if (task?.start_datetime && task?.end_datetime) {
    return { taskId: task.task_id, start: new Date(task.start_datetime), end: new Date(task.end_datetime), source: task.title };
  }
  if (schedule?.start_time && schedule?.end_time) {
    const overnight = schedule.end_time <= schedule.start_time;
    return {
      taskId: null,
      start: scheduledDate(workDate, schedule.start_time),
      end: scheduledDate(workDate, schedule.end_time, overnight),
      source: "attendance schedule",
    };
  }
  return null;
}

function monthExclusiveEnd(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { userId, error: accountError } = await getMyAccountId(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    // Month view — used to compute each day's on-time/late/absent dot.
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { data: records, error: recordsError } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .gte("work_date", `${month}-01`)
        .lt("work_date", monthExclusiveEnd(month));

      if (recordsError) {
        return NextResponse.json({ error: recordsError.message }, { status: 400 });
      }

      return NextResponse.json({ records: records ?? [] });
    }

    const { data: latest, error: latestError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      return NextResponse.json({ error: latestError.message }, { status: 400 });
    }

    return NextResponse.json({ record: latest ?? null });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { userId, error: accountError } = await getMyAccountId(supabase, user);
    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const body = await request.json();
    const action = body.action;
    const verified = body.verified === true;
    const distance = typeof body.distance === "number" ? body.distance : null;
    const workDate = typeof body.workDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.workDate) ? body.workDate : null;

    if (!verified) {
      return NextResponse.json({ error: "Face was not verified. Please try again." }, { status: 400 });
    }

    if (action === "clock_in") {
      const { data: openRecord, error: openError } = await supabase
        .from("attendance")
        .select("attendance_id")
        .eq("user_id", userId)
        .is("clock_out_at", null)
        .maybeSingle();

      if (openError) {
        return NextResponse.json({ error: openError.message }, { status: 400 });
      }
      if (openRecord) {
        return NextResponse.json({ error: "You are already clocked in." }, { status: 400 });
      }

      const clockInAt = new Date();
      const resolvedWorkDate = workDate ?? clockInAt.toISOString().slice(0, 10);
      const clockWindow = await loadClockWindow(supabase, userId, resolvedWorkDate);
      if (!clockWindow) {
        return NextResponse.json({ error: "Clock in is available only for an assigned task or scheduled shift." }, { status: 403 });
      }
      const allowedStart = new Date(clockWindow.start.getTime() - 30 * 60 * 1000);
      const allowedEnd = new Date(clockWindow.end.getTime() + 30 * 60 * 1000);
      if (clockInAt < allowedStart) {
        return NextResponse.json({ error: `Clock in is too early. The permitted window begins ${allowedStart.toISOString()}.` }, { status: 400 });
      }
      if (clockInAt > allowedEnd) {
        return NextResponse.json({ error: `Clock in is too late. The permitted window ended ${allowedEnd.toISOString()}.` }, { status: 400 });
      }
      const lateMinutes = Math.max(0, Math.round((clockInAt - clockWindow.start) / 60000));

      const { data: record, error: insertError } = await supabase
        .from("attendance")
        .insert({
          user_id: userId,
          work_date: resolvedWorkDate,
          clock_in_at: clockInAt.toISOString(),
          clock_in_verified: verified,
          clock_in_distance: distance,
          late_minutes: lateMinutes,
          task_id: clockWindow.taskId,
          scheduled_start_at: clockWindow.start.toISOString(),
          scheduled_end_at: clockWindow.end.toISOString(),
          break_minutes: 0,
          timezone: "UTC",
        })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      return NextResponse.json({ record });
    }

    if (action === "clock_out") {
      const { data: openRecord, error: openError } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .is("clock_out_at", null)
        .maybeSingle();

      if (openError) {
        return NextResponse.json({ error: openError.message }, { status: 400 });
      }
      if (!openRecord) {
        return NextResponse.json({ error: "You are not clocked in." }, { status: 400 });
      }

      const clockOutAt = new Date();
      const clockInAt = new Date(openRecord.clock_in_at);
      const elapsedHours = Math.max(0, (clockOutAt.getTime() - clockInAt.getTime()) / 3600000);
      const breakMinutes = elapsedHours >= 6 ? 60 : 0;
      const totalHours = Math.round(Math.max(0, elapsedHours - breakMinutes / 60) * 100) / 100;
      const scheduledEnd = openRecord.scheduled_end_at ? new Date(openRecord.scheduled_end_at) : null;
      const overtimeMinutes = scheduledEnd ? Math.max(0, Math.round((clockOutAt - scheduledEnd) / 60000)) : null;

      const { data: record, error: updateError } = await supabase
        .from("attendance")
        .update({
          clock_out_at: clockOutAt.toISOString(),
          clock_out_verified: verified,
          clock_out_distance: distance,
          total_hours: totalHours,
          overtime_minutes: overtimeMinutes,
          break_minutes: breakMinutes,
          updated_at: clockOutAt.toISOString(),
        })
        .eq("attendance_id", openRecord.attendance_id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ record });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
