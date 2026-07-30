import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMessageAndGetReply } from "@/lib/foundryAgent";
import { ensureAiRecommendationsGroup } from "@/lib/taskGroups";
import { arrangeOrgChart } from "@/lib/orgChartAutomation";
import { getAccountsWithProfiles } from "@/app/api/my-organization/route";

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

// The org-chart tool is only offered to a User Admin's agent — everyone
// else's agent never even sees it as an option.
async function getOrgChartRoster(supabase, agent) {
  const { data: account } = await supabase
    .from("user_account")
    .select("role_id")
    .eq("user_id", agent.user_id)
    .maybeSingle();
  if (!account?.role_id) return null;

  const { data: role } = await supabase.from("role").select("role_name").eq("role_id", account.role_id).maybeSingle();
  if ((role?.role_name ?? "").trim().toLowerCase() !== "user admin") return null;

  const { accounts } = await getAccountsWithProfiles(supabase, agent.organization_id);
  return (accounts ?? []).map((a) => a.full_name).filter(Boolean);
}

export async function GET(request, { params }) {
  try {
    const { threadId } = await params;
    const supabase = getSupabaseAdminClient();
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
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
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
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

    const orgChartRoster = await getOrgChartRoster(supabase, agent);

    const {
      responseId,
      reply: modelReply,
      proposedTasks,
      arrangeOrgChart: orgChartArgs,
      usage,
    } = await sendMessageAndGetReply({
      instructions: agent.instructions,
      input: content,
      previousResponseId: thread.last_response_id,
      vectorStoreId: agent.foundry_vector_store_id,
      orgChartRoster,
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

    let reply = modelReply;
    if (orgChartArgs) {
      const result = await arrangeOrgChart(supabase, {
        organizationId: agent.organization_id,
        departments: orgChartArgs.departments,
        connections: orgChartArgs.connections,
      });
      const summary = `Set up the org chart: ${result.departmentsCreated} department${result.departmentsCreated === 1 ? "" : "s"} created, ${result.membersAssigned} ${result.membersAssigned === 1 ? "person" : "people"} assigned, ${result.connectionsCreated} connection${result.connectionsCreated === 1 ? "" : "s"} drawn.${
        result.unmatchedNames.length ? ` Couldn't match: ${result.unmatchedNames.join(", ")}.` : ""
      }`;
      reply = reply ? `${reply}\n\n${summary}` : summary;
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
    const { user, error: authError } = await getAuthenticatedUser(request, supabase);
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
