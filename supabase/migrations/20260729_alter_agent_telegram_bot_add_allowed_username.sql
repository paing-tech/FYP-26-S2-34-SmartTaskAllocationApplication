-- Restricts direct task creation from Telegram (no review step) to one
-- trusted Telegram username per agent. Anyone else messaging the bot still
-- only ever gets propose-and-review-in-app behavior.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent_telegram_bot add column if not exists allowed_username text;
