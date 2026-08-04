import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMessageAndGetReply } from "@/lib/foundryAgent";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { matchTaskGroupByName, ensureUntitledGroup } from "@/lib/taskGroups";

async function getOrCreateTelegramThread(supabase, agent, chatId) {
  const { data: existing } = await supabase
    .from("agent_chat_thread")
    .select("*")
    .eq("agent_id", agent.agent_id)
    .eq("source", "telegram")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from("agent_chat_thread")
    .insert({
      agent_id: agent.agent_id,
      title: "Telegram chat",
      source: "telegram",
      telegram_chat_id: chatId,
    })
    .select("*")
    .single();

  return created;
}

// Creates tasks on the agent owner's behalf without a browser session, via
// the narrow internal-secret bypass on /api/tasks (see getInternalAuthUser
// there) — only reachable with AGENT_INTERNAL_API_SECRET, never exposed to
// a client.
async function createTasksDirectly(tasks, { origin, agentUserId, agentName, needsApproval, defaultGroupId, taskGroups }) {
  const headers = {
    "Content-Type": "application/json",
    "x-agent-internal-secret": process.env.AGENT_INTERNAL_API_SECRET ?? "",
    "x-agent-internal-user-id": agentUserId,
  };
  const approvedAt = new Date().toISOString();
  const created = [];

  for (const task of tasks) {
    const reasons = {
      creation: [`Created directly by ${agentName} via Telegram.`],
      creationKind: "agent_telegram_direct",
      agentName,
    };
    if (!needsApproval) {
      reasons.approvedBy = agentName;
      reasons.approvedAt = approvedAt;
    }

    const response = await fetch(`${origin}/api/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        groupId: matchTaskGroupByName(taskGroups, task.groupName) ?? defaultGroupId,
        title: task.title,
        description: task.description,
        priority: task.priority || "Medium",
        assignedBy: agentName,
        source: "optimus_ai",
        aiState: needsApproval ? "active" : "accepted",
        reasons,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      created.push(result.task?.title ?? task.title);
    }
  }

  if (created.length) {
    await fetch(`${origin}/api/tasks`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "auto-allocate-tasks", enabled: true }),
    });
  }

  return created;
}

// Telegram retries on non-2xx, so this always acks 200 even when internal
// processing fails — the failure is surfaced in the response body only.
export async function POST(request, { params }) {
  const { secret } = await params;
  const supabase = getSupabaseAdminClient();

  try {
    const { data: link } = await supabase
      .from("agent_telegram_bot")
      .select("agent_id, bot_token, allowed_username")
      .eq("webhook_secret", secret)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ ok: false, error: "Unknown webhook." }, { status: 404 });
    }

    const update = await request.json();
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    const { data: agent } = await supabase.from("agent").select("*").eq("agent_id", link.agent_id).maybeSingle();
    if (!agent) {
      return NextResponse.json({ ok: false, error: "Agent not found." });
    }

    const senderUsername = update.message?.from?.username;
    const allowDirectCreate = Boolean(
      link.allowed_username && senderUsername && link.allowed_username === senderUsername.toLowerCase(),
    );

    // Caches the allowed user's chat id the first time they actually message
    // the bot, so proactive notifications (task status changes, etc.) have
    // somewhere to send without needing a live conversation.
    if (allowDirectCreate) {
      await supabase
        .from("agent_telegram_bot")
        .update({ allowed_chat_id: String(chatId), updated_at: new Date().toISOString() })
        .eq("agent_id", link.agent_id);
    }

    const thread = await getOrCreateTelegramThread(supabase, agent, String(chatId));
    const { data: taskGroups } = await supabase
      .from("task_group")
      .select("group_id, group_name")
      .eq("organization_id", agent.organization_id)
      .order("sort_order", { ascending: true });
    const { responseId, reply, proposedTasks, createTasksNow, usage } = await sendMessageAndGetReply({
      instructions: agent.instructions,
      input: text,
      previousResponseId: thread.last_response_id,
      vectorStoreId: agent.foundry_vector_store_id,
      allowDirectCreate,
      taskGroups: (taskGroups ?? []).map((group) => group.group_name),
    });

    await supabase.from("agent_token_usage").insert({
      agent_id: agent.agent_id,
      organization_id: agent.organization_id,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    });
    await supabase
      .from("agent_chat_thread")
      .update({
        updated_at: new Date().toISOString(),
        last_response_id: responseId,
        messages: [...(thread.messages ?? []), { role: "user", content: text }, { role: "assistant", content: reply }],
      })
      .eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    // Telegram can't render the interactive checklist the web chat uses, so
    // proposed tasks need a plain-text fallback — and either way, the reply
    // can legitimately come back empty (e.g. right after a function call),
    // so always send *something* rather than silently going quiet.
    let outgoingText = reply;
    if (createTasksNow?.tasks?.length) {
      const defaultGroupId = await ensureUntitledGroup(supabase, agent.organization_id);
      const created = await createTasksDirectly(createTasksNow.tasks, {
        origin: request.nextUrl.origin,
        agentUserId: agent.user_id,
        agentName: agent.name,
        needsApproval: createTasksNow.needsApproval,
        defaultGroupId,
        taskGroups,
      });
      outgoingText = `${reply ? `${reply}\n\n` : ""}Created ${created.length} task${created.length === 1 ? "" : "s"}: ${created.join(", ")} (${
        createTasksNow.needsApproval ? "pending approval" : "auto-approved"
      }).`;
    } else if (proposedTasks?.length) {
      const list = proposedTasks.map((task, index) => `${index + 1}. ${task.title}`).join("\n");
      outgoingText = `${reply ? `${reply}\n\n` : ""}I'd suggest these tasks:\n${list}\n\nOpen the Agent page in the app to review and create them.`;
    }
    if (!outgoingText) {
      outgoingText = "Sorry, I didn't have a response for that — please try again.";
    }
    await sendTelegramMessage(link.bot_token, chatId, outgoingText);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Telegram never reads this body (see note above), so without logging
    // here a failure is invisible outside of Vercel's function logs.
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: false, error: error.message });
  }
}
