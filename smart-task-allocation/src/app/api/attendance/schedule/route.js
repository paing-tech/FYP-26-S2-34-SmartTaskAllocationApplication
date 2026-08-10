import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getMyAccountId(supabase, user) {
  const byId = await supabase.from("user_account").select("user_id").eq("user_id", user.id).maybeSingle();
  if (byId.error || byId.data) {
    return { userId: byId.data?.user_id, error: byId.error };
  }

  const byEmail = await supabase.from("user_account").select("user_id").eq("email", user.email).maybeSingle();
  return { userId: byEmail.data?.user_id, error: byEmail.error };
}

function isValidMonth(month) {
  return typeof month === "string" && /^\d{4}-\d{2}$/.test(month);
}

function isValidDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTime(time) {
  return typeof time === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(time);
}

// Exclusive upper bound for a "YYYY-MM" month, e.g. "2026-07" -> "2026-08-01"
// (and "2026-12" -> "2027-01-01"), since day 32 isn't a valid date literal.
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
    if (!isValidMonth(month)) {
      return NextResponse.json({ error: "A month (YYYY-MM) is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("attendance_schedule")
      .select("work_date, start_time, end_time")
      .eq("user_id", userId)
      .gte("work_date", `${month}-01`)
      .lt("work_date", monthExclusiveEnd(month));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ days: data ?? [] });
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
    const dates = Array.isArray(body.dates) ? body.dates.filter(isValidDate) : [];
    const startTime = body.startTime;
    const endTime = body.endTime;

    if (!dates.length) {
      return NextResponse.json({ error: "At least one date is required." }, { status: 400 });
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return NextResponse.json({ error: "A valid start and end time are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("attendance_schedule")
      .upsert(
        dates.map((workDate) => ({
          user_id: userId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,work_date" },
      )
      .select("work_date, start_time, end_time");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ days: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
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
    const date = searchParams.get("date");
    if (!isValidDate(date)) {
      return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("attendance_schedule")
      .delete()
      .eq("user_id", userId)
      .eq("work_date", date);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
