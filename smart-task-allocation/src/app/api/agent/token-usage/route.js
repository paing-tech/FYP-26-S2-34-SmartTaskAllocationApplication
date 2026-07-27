import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function startOfDayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function startOfWeekIso() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function sumTokens(rows) {
  return rows.reduce((total, row) => total + (row.total_tokens || 0), 0);
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data: agent } = await supabase
      .from("agent")
      .select("agent_id, daily_token_limit")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ today: 0, thisWeek: 0, allTime: 0, dailyLimit: 0 });
    }

    const { data, error } = await supabase
      .from("agent_token_usage")
      .select("total_tokens, created_at")
      .eq("agent_id", agent.agent_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = data ?? [];
    const todayCutoff = startOfDayIso();
    const weekCutoff = startOfWeekIso();
    const today = sumTokens(rows.filter((row) => row.created_at >= todayCutoff));

    return NextResponse.json({
      today,
      thisWeek: sumTokens(rows.filter((row) => row.created_at >= weekCutoff)),
      allTime: sumTokens(rows),
      dailyLimit: agent.daily_token_limit,
      dailyPercent: agent.daily_token_limit ? Math.min(100, Math.round((today / agent.daily_token_limit) * 100)) : 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
