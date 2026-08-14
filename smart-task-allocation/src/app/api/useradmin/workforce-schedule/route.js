import { NextResponse } from "next/server";
import { getRequesterOrganizationId, requireUserAdmin } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// Compact, single-day version of the query above — used by the agent's
// get_todays_schedule tool (see the agent messages route), which only ever
// needs "who's working today, what time, have they clocked in" rather than
// the full week-view payload the calendar UI fetches.
export async function getTodaysScheduleSummary(supabase, organizationId, dateStr) {
  if (!organizationId) return [];

  const { data: accounts, error: accountsError } = await supabase
    .from("user_account")
    .select("user_id, role:role_id(role_name), department:department_id(department_name)")
    .eq("organization_id", organizationId)
    .eq("account_status", "Active");
  if (accountsError || !accounts?.length) return [];

  // Same manager/employee-only filter as the calendar's own query below —
  // other roles (e.g. User Admin) don't have attendance schedules, so
  // including them would just be noise in the agent's answer.
  const peopleAccounts = accounts.filter((account) => {
    const role = String(account.role?.role_name || "").toLowerCase();
    return role === "manager" || role === "employee";
  });
  if (!peopleAccounts.length) return [];
  const userIds = peopleAccounts.map((account) => account.user_id);

  const [profilesResult, schedulesResult, attendanceResult] = await Promise.all([
    supabase.from("profile").select("user_id, full_name").in("user_id", userIds),
    supabase
      .from("attendance_schedule")
      .select("user_id, start_time, end_time")
      .in("user_id", userIds)
      .eq("work_date", dateStr),
    supabase
      .from("attendance")
      .select("user_id, clock_in_at, clock_out_at")
      .in("user_id", userIds)
      .eq("work_date", dateStr),
  ]);

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));
  const schedules = new Map((schedulesResult.data ?? []).map((row) => [row.user_id, row]));
  const attendance = new Map((attendanceResult.data ?? []).map((row) => [row.user_id, row]));

  return peopleAccounts
    .map((account) => {
      const schedule = schedules.get(account.user_id);
      const record = attendance.get(account.user_id);
      return {
        name: profiles.get(account.user_id)?.full_name || "Unnamed",
        department: account.department?.department_name ?? "No department",
        scheduledStart: schedule?.start_time ?? null,
        scheduledEnd: schedule?.end_time ?? null,
        clockedIn: Boolean(record?.clock_in_at),
        clockInTime: record?.clock_in_at ?? null,
        clockedOut: Boolean(record?.clock_out_at),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireUserAdmin(request, supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const organizationId = await getRequesterOrganizationId(supabase, user);
    const url = new URL(request.url);
    const targetUserId = url.searchParams.get("userId");
    const date = url.searchParams.get("date");
    const weekStart = url.searchParams.get("weekStart");
    const weekEnd = url.searchParams.get("weekEnd");
    const startDate = url.searchParams.get("start");
    const endDate = url.searchParams.get("end");

    if (organizationId && /^\d{4}-\d{2}-\d{2}$/.test(date || "") && !targetUserId) {
      const { data: accounts, error: accountsError } = await supabase
        .from("user_account")
        .select("user_id, role:role_id(role_name), department:department_id(department_id, department_name)")
        .eq("organization_id", organizationId)
        .eq("account_status", "Active");
      if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 400 });

      const peopleAccounts = (accounts ?? []).filter((account) => {
        const role = String(account.role?.role_name || "").toLowerCase();
        return role === "manager" || role === "employee";
      });
      const userIds = peopleAccounts.map((account) => account.user_id);
      if (!userIds.length) return NextResponse.json({ people: [] });

      const hasWeek = /^\d{4}-\d{2}-\d{2}$/.test(weekStart || "") && /^\d{4}-\d{2}-\d{2}$/.test(weekEnd || "");
      const scheduleQuery = supabase.from("attendance_schedule").select("user_id, work_date, start_time, end_time").in("user_id", userIds);
      const attendanceQuery = supabase.from("attendance").select("user_id, work_date, clock_in_at, clock_out_at, late_minutes, overtime_minutes").in("user_id", userIds);
      const [profilesResult, schedulesResult, attendanceResult] = await Promise.all([
        supabase.from("profile").select("user_id, full_name, profile_picture_url").in("user_id", userIds),
        hasWeek ? scheduleQuery.gte("work_date", weekStart).lte("work_date", weekEnd) : scheduleQuery.eq("work_date", date),
        hasWeek ? attendanceQuery.gte("work_date", weekStart).lte("work_date", weekEnd) : attendanceQuery.eq("work_date", date),
      ]);
      if (profilesResult.error) return NextResponse.json({ error: profilesResult.error.message }, { status: 400 });
      if (schedulesResult.error) return NextResponse.json({ error: schedulesResult.error.message }, { status: 400 });
      if (attendanceResult.error) return NextResponse.json({ error: attendanceResult.error.message }, { status: 400 });

      const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));
      const schedules = schedulesResult.data ?? [];
      const attendance = attendanceResult.data ?? [];
      const people = peopleAccounts.map((account) => {
        const profile = profiles.get(account.user_id);
        return {
          userId: account.user_id,
          role: String(account.role?.role_name || "").toLowerCase(),
          departmentId: account.department?.department_id ?? null,
          departmentName: account.department?.department_name ?? "No department",
          fullName: profile?.full_name || "Unnamed",
          avatarUrl: profile?.profile_picture_url ?? null,
          schedule: schedules.find((item) => item.user_id === account.user_id && item.work_date === date) ?? null,
          attendance: attendance.find((item) => item.user_id === account.user_id && item.work_date === date) ?? null,
          week: schedules.filter((item) => item.user_id === account.user_id).map((schedule) => ({
            ...schedule,
            attendance: attendance.find((item) => item.user_id === account.user_id && item.work_date === schedule.work_date) ?? null,
          })),
        };
      }).sort((a, b) => a.fullName.localeCompare(b.fullName));

      return NextResponse.json({ people });
    }

    if (!organizationId || !targetUserId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) {
      return NextResponse.json({ error: "A user and valid date range are required." }, { status: 400 });
    }

    const { data: account, error: accountError } = await supabase
      .from("user_account")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 400 });
    if (!account) return NextResponse.json({ error: "That person could not be found in your organization." }, { status: 404 });

    const [{ data: schedules, error: scheduleError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase
        .from("attendance_schedule")
        .select("work_date, start_time, end_time")
        .eq("user_id", targetUserId)
        .gte("work_date", startDate)
        .lte("work_date", endDate),
      supabase
        .from("attendance")
        .select("work_date, clock_in_at, clock_out_at, late_minutes, overtime_minutes")
        .eq("user_id", targetUserId)
        .gte("work_date", startDate)
        .lte("work_date", endDate),
    ]);

    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 400 });
    if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 400 });

    return NextResponse.json({ schedules: schedules ?? [], attendance: attendance ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
