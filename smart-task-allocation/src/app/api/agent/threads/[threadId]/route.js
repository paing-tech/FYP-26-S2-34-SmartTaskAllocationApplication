import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function getMyThread(supabase, user, threadId) {
  const { data: agent } = await supabase.from("agent").select("agent_id").eq("user_id", user.id).maybeSingle();
  if (!agent) return null;

  const { data: thread } = await supabase
    .from("agent_chat_thread")
    .select("*")
    .eq("agent_chat_thread_id", threadId)
    .eq("agent_id", agent.agent_id)
    .maybeSingle();

  return thread;
}

export async function PATCH(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const thread = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const body = await request.json();
    const updates = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim().slice(0, 60);
    }
    if (typeof body.pinned === "boolean") {
      updates.pinned = body.pinned;
    }

    const { data: updated, error } = await supabase
      .from("agent_chat_thread")
      .update(updates)
      .eq("agent_chat_thread_id", threadId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ thread: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const thread = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const { error } = await supabase.from("agent_chat_thread").delete().eq("agent_chat_thread_id", threadId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
