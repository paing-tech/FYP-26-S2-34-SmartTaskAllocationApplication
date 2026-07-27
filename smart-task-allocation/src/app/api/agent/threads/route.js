import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getMyAgent(supabase, user) {
  const { data } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
  return data ?? null;
}

export async function GET(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ threads: [] });
    }

    const { data, error } = await supabase
      .from("agent_chat_thread")
      .select("*")
      .eq("agent_id", agent.agent_id)
      .eq("source", "web")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ threads: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const agent = await getMyAgent(supabase, user);
    if (!agent) {
      return NextResponse.json({ error: "Create your agent before starting a chat." }, { status: 404 });
    }

    const { data: created, error: insertError } = await supabase
      .from("agent_chat_thread")
      .insert({ agent_id: agent.agent_id, title: "New chat", source: "web" })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ thread: created });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
