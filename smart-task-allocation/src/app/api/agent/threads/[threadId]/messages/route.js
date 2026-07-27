import { NextResponse } from "next/server";
import { requireManager } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMessageAndGetReply } from "@/lib/foundryAgent";
import { ensureAiRecommendationsGroup } from "@/lib/taskGroups";

async function getMyThread(supabase, user, threadId) {
  const { data: agent } = await supabase.from("agent").select("*").eq("user_id", user.id).maybeSingle();
  if (!agent) return { agent: null, thread: null };

  const { data: thread } = await supabase
    .from("agent_chat_thread")
    .select("*")
    .eq("agent_chat_thread_id", threadId)
    .eq("agent_id", agent.agent_id)
    .maybeSingle();

  return { agent, thread };
}

export async function GET(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ messages: thread.messages ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { agent, thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const body = await request.json();
    const content = typeof body.message === "string" ? body.message.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    const { responseId, reply, proposedTasks, usage } = await sendMessageAndGetReply({
      instructions: agent.instructions,
      input: content,
      previousResponseId: thread.last_response_id,
      vectorStoreId: agent.foundry_vector_store_id,
    });

    await supabase.from("agent_token_usage").insert({
      agent_id: agent.agent_id,
      organization_id: agent.organization_id,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    });

    let taskProposal = null;
    if (proposedTasks?.length) {
      const groupId = await ensureAiRecommendationsGroup(supabase, agent.organization_id);
      taskProposal = { tasks: proposedTasks, groupId };
    }

    const updates = {
      updated_at: new Date().toISOString(),
      last_response_id: responseId,
      messages: [
        ...(thread.messages ?? []),
        { role: "user", content },
        { role: "assistant", content: reply, taskProposal },
      ],
    };
    if (thread.title === "New chat") {
      updates.title = content.slice(0, 60);
    }
    await supabase.from("agent_chat_thread").update(updates).eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    return NextResponse.json({ reply, title: updates.title, taskProposal });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Persists a task proposal's resolution (which tasks were kept, whether
// they've been created) onto its message so a page reload shows the same
// closed-out state instead of a fresh, re-clickable checklist.
export async function PATCH(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await requireManager(request, supabase);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { thread } = await getMyThread(supabase, user, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const body = await request.json();
    const messageIndex = Number(body.messageIndex);
    const taskProposal = body.taskProposal;
    const messages = thread.messages ?? [];
    if (!Number.isInteger(messageIndex) || !messages[messageIndex]) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const updatedMessages = messages.map((message, index) =>
      index === messageIndex ? { ...message, taskProposal } : message,
    );

    const { error } = await supabase
      .from("agent_chat_thread")
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
