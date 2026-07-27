import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendMessageAndGetReply } from "@/lib/foundryAgent";
import { sendTelegramMessage } from "@/lib/telegramBot";

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

// Telegram retries on non-2xx, so this always acks 200 even when internal
// processing fails — the failure is surfaced in the response body only.
export async function POST(request, { params }) {
  const { secret } = await params;
  const supabase = getSupabaseAdminClient();

  try {
    const { data: link } = await supabase
      .from("agent_telegram_bot")
      .select("agent_id, bot_token")
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

    const thread = await getOrCreateTelegramThread(supabase, agent, String(chatId));
    const { responseId, reply, usage } = await sendMessageAndGetReply({
      instructions: agent.instructions,
      input: text,
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
    await supabase
      .from("agent_chat_thread")
      .update({
        updated_at: new Date().toISOString(),
        last_response_id: responseId,
        messages: [...(thread.messages ?? []), { role: "user", content: text }, { role: "assistant", content: reply }],
      })
      .eq("agent_chat_thread_id", thread.agent_chat_thread_id);

    if (reply) {
      await sendTelegramMessage(link.bot_token, chatId, reply);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
