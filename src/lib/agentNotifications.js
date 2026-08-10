import { sendTelegramMessage } from "@/lib/telegramBot";

// Best-effort — a notification failing should never break the task action
// that triggered it — but every stopping point is logged (console.error, so
// it shows up in Vercel's function logs) since this previously failed
// completely silently with no way to tell why nothing was sent.
export async function notifyAgentOwnerTelegram(supabase, { ownerUserId, message }) {
  if (!ownerUserId) {
    console.error("notifyAgentOwnerTelegram: no ownerUserId provided");
    return;
  }

  const { data: agent, error: agentError } = await supabase
    .from("agent")
    .select("agent_id")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (agentError) {
    console.error("notifyAgentOwnerTelegram: agent lookup failed:", agentError.message);
    return;
  }
  if (!agent) {
    console.error("notifyAgentOwnerTelegram: no agent for user", ownerUserId);
    return;
  }

  const { data: link, error: linkError } = await supabase
    .from("agent_telegram_bot")
    .select("bot_token, allowed_chat_id, allowed_username")
    .eq("agent_id", agent.agent_id)
    .maybeSingle();
  if (linkError) {
    console.error("notifyAgentOwnerTelegram: telegram link lookup failed:", linkError.message);
    return;
  }
  if (!link) {
    console.error("notifyAgentOwnerTelegram: no Telegram connected for agent", agent.agent_id);
    return;
  }
  if (!link.allowed_chat_id) {
    console.error(
      "notifyAgentOwnerTelegram: no cached chat id yet — allowed_username",
      link.allowed_username,
      "needs to message the bot at least once first",
    );
    return;
  }

  try {
    await sendTelegramMessage(link.bot_token, link.allowed_chat_id, message);
  } catch (sendError) {
    console.error("notifyAgentOwnerTelegram: Telegram send failed:", sendError.message);
  }
}
