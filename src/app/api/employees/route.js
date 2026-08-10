import { NextResponse } from "next/server";
import { isPlatformAdminRole, requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);

    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const organizationId = await getManagerOrganizationId(supabase, user);

    // Accounts must belong to the requester's organization. If the requester
    // has no organization, they can see no one (never expose null-org accounts).
    if (!organizationId) {
      return NextResponse.json({ user_accounts: [], employees: [] });
    }

    const { data: rawData, error } = await supabase
      .from("user_account")
      .select(
        "user_id, username, email, account_status, created_at, role:role_id(role_name), department:department_id(department_name)"
      )
      .eq("organization_id", organizationId)
      .order("username", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Platform admins are not part of any organization's roster.
    const data = (rawData ?? []).filter(
      (employee) => !isPlatformAdminRole(employee.role?.role_name),
    );

    const employeeIds = data.map((employee) => employee.user_id);

    // Merge full_name + job_title from the profile table so the UI can show
    // real names and roles.
    let fullNameByUserId = new Map();
    let jobTitleByUserId = new Map();
    let phoneByUserId = new Map();
    let avatarByUserId = new Map();
    if (employeeIds.length) {
      const { data: profiles } = await supabase
        .from("profile")
        .select("user_id, full_name, job_title, phone_number, profile_picture_url")
        .in("user_id", employeeIds);
      fullNameByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile.full_name]),
      );
      jobTitleByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile.job_title]),
      );
      phoneByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile.phone_number]),
      );
      avatarByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.user_id, profile.profile_picture_url]),
      );
    }
    const [
      { data: skillRows, error: skillError },
      { data: availabilityRows, error: availabilityError },
      { data: availableStatusRows, error: availableStatusError },
    ] =
      employeeIds.length
        ? await Promise.all([
            supabase
              .from("user_skill")
              .select("user_id, skill:skill_id(skill_name)")
              .in("user_id", employeeIds),
            supabase
              .from("availability")
              .select("user_id, status, availability_start, availability_end")
              .in("user_id", employeeIds)
              .order("availability_start", { ascending: false }),
            supabase
              .from("availability")
              .select("user_id, status")
              .ilike("status", "%Available%"),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];

    if (skillError) {
      return NextResponse.json({ error: skillError.message }, { status: 400 });
    }

    if (availabilityError) {
      return NextResponse.json({ error: availabilityError.message }, { status: 400 });
    }

    if (availableStatusError) {
      return NextResponse.json({ error: availableStatusError.message }, { status: 400 });
    }

    // Worked hours this week, summed from work_log clock in/out spans.
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const workedHoursByUserId = new Map();
    if (employeeIds.length) {
      const { data: workLogs } = await supabase
        .from("work_log")
        .select("user_id, clock_in_at, clock_out_at")
        .in("user_id", employeeIds)
        .gte("clock_in_at", weekStart.toISOString());

      for (const log of workLogs ?? []) {
        const start = new Date(log.clock_in_at);
        if (Number.isNaN(start.getTime())) continue;
        // Open shifts count up to now; closed shifts up to clock-out.
        const end = log.clock_out_at ? new Date(log.clock_out_at) : now;
        if (Number.isNaN(end.getTime())) continue;
        const minutes = Math.max(0, (end.getTime() - start.getTime()) / 60000);
        workedHoursByUserId.set(
          log.user_id,
          (workedHoursByUserId.get(log.user_id) ?? 0) + minutes,
        );
      }
    }

    // Sun-Sat weekly attendance strip: "scheduled" (blue) if a schedule row
    // exists with no clock-in yet, "clocked_in" (emerald) once they have,
    // "absent" (red) if a scheduled day has already passed with no clock-in.
    const weekStartSun = new Date(now);
    weekStartSun.setHours(0, 0, 0, 0);
    weekStartSun.setDate(weekStartSun.getDate() - weekStartSun.getDay());
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStartSun);
      date.setDate(weekStartSun.getDate() + index);
      return toDateStr(date);
    });
    const todayDateStr = toDateStr(now);

    const scheduledKeys = new Set();
    const clockedInKeys = new Set();
    if (employeeIds.length) {
      const [{ data: scheduleRows }, { data: attendanceRows }] = await Promise.all([
        supabase
          .from("attendance_schedule")
          .select("user_id, work_date")
          .in("user_id", employeeIds)
          .gte("work_date", weekDates[0])
          .lte("work_date", weekDates[6]),
        supabase
          .from("attendance")
          .select("user_id, work_date, clock_in_at")
          .in("user_id", employeeIds)
          .gte("work_date", weekDates[0])
          .lte("work_date", weekDates[6]),
      ]);

      for (const row of scheduleRows ?? []) {
        scheduledKeys.add(`${row.user_id}:${row.work_date}`);
      }
      for (const row of attendanceRows ?? []) {
        if (row.clock_in_at) clockedInKeys.add(`${row.user_id}:${row.work_date}`);
      }
    }

    function weekAttendanceFor(userId) {
      return weekDates.map((dateStr) => {
        const key = `${userId}:${dateStr}`;
        if (clockedInKeys.has(key)) return { date: dateStr, status: "clocked_in" };
        if (scheduledKeys.has(key)) return { date: dateStr, status: dateStr < todayDateStr ? "absent" : "scheduled" };
        return { date: dateStr, status: null };
      });
    }

    const skillsByUserId = new Map();
    const skillDetailsByUserId = new Map();
    const availabilityByUserId = new Map();

    for (const row of skillRows ?? []) {
      const skillName = row.skill?.skill_name;

      if (!skillName) {
        continue;
      }

      const currentSkills = skillsByUserId.get(row.user_id) ?? [];
      currentSkills.push(skillName);
      skillsByUserId.set(row.user_id, currentSkills);

      const currentDetails = skillDetailsByUserId.get(row.user_id) ?? [];
      currentDetails.push({ name: skillName });
      skillDetailsByUserId.set(row.user_id, currentDetails);
    }

    const availabilitiesByUserId = new Map();
    const employeeIdSet = new Set(employeeIds);
    const availableUserIds = new Set();

    for (const row of availableStatusRows ?? []) {
      const status = String(row?.status || "").trim().toLowerCase();
      if (
        employeeIdSet.has(row.user_id) &&
        status.includes("available") &&
        !status.includes("not available") &&
        !status.includes("unavailable")
      ) {
        availableUserIds.add(row.user_id);
      }
    }

    for (const row of availabilityRows ?? []) {
      if (!availabilityByUserId.has(row.user_id)) {
        availabilityByUserId.set(row.user_id, row);
      }
      const list = availabilitiesByUserId.get(row.user_id) ?? [];
      list.push(row);
      availabilitiesByUserId.set(row.user_id, list);
    }

    const userAccounts = (data ?? []).map((employee) => ({
      ...employee,
      full_name: fullNameByUserId.get(employee.user_id) ?? null,
      job_title: jobTitleByUserId.get(employee.user_id) ?? null,
      phone_number: phoneByUserId.get(employee.user_id) ?? null,
      avatar_url: avatarByUserId.get(employee.user_id) ?? null,
      availability: availabilityByUserId.get(employee.user_id) ?? null,
      availabilities: availabilitiesByUserId.get(employee.user_id) ?? [],
      is_available: availableUserIds.has(employee.user_id),
      skills: skillsByUserId.get(employee.user_id) ?? [],
      skill_details: skillDetailsByUserId.get(employee.user_id) ?? [],
      worked_hours_this_week: Math.round((workedHoursByUserId.get(employee.user_id) ?? 0) / 60),
      week_attendance: weekAttendanceFor(employee.user_id),
    }));

    return NextResponse.json({
      user_accounts: userAccounts,
      employees: userAccounts,
      availabilitySummary: {
        availableEmployees: availableUserIds.size,
        totalEmployees: employeeIds.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
