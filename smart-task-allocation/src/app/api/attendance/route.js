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

// Minutes between `atTime` and that day's scheduled start/end time — positive
// means late (clock-in) or overtime (clock-out), negative means early. Uses
// atTime's own date (rather than a separately-computed "today") so the
// lookup always matches the exact clock event being recorded.
async function minutesAgainstSchedule(supabase, userId, atTime, field) {
  const workDateStr = atTime.toISOString().slice(0, 10);

  const { data: schedule } = await supabase
    .from("attendance_schedule")
    .select(field)
    .eq("user_id", userId)
    .eq("work_date", workDateStr)
    .maybeSingle();

  const timeStr = schedule?.[field];
  if (!timeStr) return null;

  const [hours, minutes] = timeStr.split(":").map(Number);
  const scheduledAt = new Date(atTime);
  scheduledAt.setHours(hours, minutes, 0, 0);

  return Math.round((atTime.getTime() - scheduledAt.getTime()) / 60000);
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
      const lateMinutes = await minutesAgainstSchedule(supabase, userId, clockInAt, "start_time");

      const { data: record, error: insertError } = await supabase
        .from("attendance")
        .insert({
          user_id: userId,
          work_date: workDate ?? clockInAt.toISOString().slice(0, 10),
          clock_in_at: clockInAt.toISOString(),
          clock_in_verified: verified,
          clock_in_distance: distance,
          late_minutes: lateMinutes,
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
      const totalHours = Math.round(((clockOutAt.getTime() - clockInAt.getTime()) / 3600000) * 100) / 100;
      const overtimeMinutes = await minutesAgainstSchedule(supabase, userId, clockOutAt, "end_time");

      const { data: record, error: updateError } = await supabase
        .from("attendance")
        .update({
          clock_out_at: clockOutAt.toISOString(),
          clock_out_verified: verified,
          clock_out_distance: distance,
          total_hours: totalHours,
          overtime_minutes: overtimeMinutes,
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
