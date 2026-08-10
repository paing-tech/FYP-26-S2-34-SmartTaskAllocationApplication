-- Cached once the allowed_username actually messages the bot (their
-- Telegram chat id), so proactive notifications (task status changes,
-- recommendations) have somewhere to send to without waiting on a live
-- conversation thread.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent_telegram_bot add column if not exists allowed_chat_id text;
