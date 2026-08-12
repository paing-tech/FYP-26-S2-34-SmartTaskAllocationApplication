import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Day-level status for Attendance History — one of four mutually exclusive
// day types (present/absent/off/late). Overtime isn't included here since
// it's an attribute of a present day, not a distinct day type — it's
// already surfaced separately by Work Hours' overtime total. A day with no
// schedule at all is "off" rather than counted against the person as an
// absence.
function statusFor(scheduled, record) {
  if (!scheduled) return "off";
  if (!record?.clock_in_at) return "absent";
  if (record.late_minutes > 0) return "late";
  return "present";
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    if (!organizationId) return NextResponse.json({ error: "You must belong to an organization." }, { status: 400 });

    const targetUserId = new URL(request.url).searchParams.get("userId");
    if (!targetUserId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

    const { data: account, error: accountError } = await supabase
      .from("user_account")
      .select("user_id, organization_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 400 });
    if (!account || account.organization_id !== organizationId) {
      return NextResponse.json({ error: "That person could not be found in your organization." }, { status: 404 });
    }

    // Rolling ~12-month window ending today, same as GitHub's own
    // contribution graph — not a Jan-Dec calendar year, so it always shows
    // a full year of history regardless of what month it currently is.
    const today = new Date();
    const rangeEnd = today.toISOString().slice(0, 10);
    const rangeStartDate = new Date(today);
    rangeStartDate.setUTCDate(rangeStartDate.getUTCDate() - 364);
    const rangeStart = rangeStartDate.toISOString().slice(0, 10);

    const [{ data: scheduleRows, error: scheduleError }, { data: attendanceRows, error: attendanceError }] =
      await Promise.all([
        supabase.from("attendance_schedule").select("work_date").eq("user_id", targetUserId).gte("work_date", rangeStart).lte("work_date", rangeEnd),
        supabase
          .from("attendance")
          .select("work_date, clock_in_at, late_minutes")
          .eq("user_id", targetUserId)
          .gte("work_date", rangeStart)
          .lte("work_date", rangeEnd),
      ]);

    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 400 });
    if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 400 });

    const scheduledDates = new Set((scheduleRows ?? []).map((row) => row.work_date));
    const recordByDate = new Map((attendanceRows ?? []).map((row) => [row.work_date, row]));

    // Every day in the range (not just days with data) so the grid renders
    // as a complete rectangle, same as GitHub's own chart — days with
    // neither a schedule nor a record just read as "off".
    const days = [];
    for (let cursor = new Date(rangeStartDate); cursor.toISOString().slice(0, 10) <= rangeEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      days.push({ date, status: statusFor(scheduledDates.has(date), recordByDate.get(date)) });
    }

    return NextResponse.json({ days });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
