import { sendTelegramMessage } from "@/lib/telegramBot";

// Best-effort, silent no-op when Telegram isn't connected or the allowed
// user has never messaged the bot yet (no cached chat id) — a notification
// failing should never break the task action that triggered it.
export async function notifyAgentOwnerTelegram(supabase, { ownerUserId, message }) {
  if (!ownerUserId) return;

  const { data: agent } = await supabase.from("agent").select("agent_id").eq("user_id", ownerUserId).maybeSingle();
  if (!agent) return;

  const { data: link } = await supabase
    .from("agent_telegram_bot")
    .select("bot_token, allowed_chat_id")
    .eq("agent_id", agent.agent_id)
    .maybeSingle();
  if (!link?.bot_token || !link?.allowed_chat_id) return;

  await sendTelegramMessage(link.bot_token, link.allowed_chat_id, message).catch(() => {});
}
