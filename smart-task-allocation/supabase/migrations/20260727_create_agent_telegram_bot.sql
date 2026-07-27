-- One Telegram bot per agent. The manager supplies their own bot token
-- (created via @BotFather); webhook_secret is a random path segment so the
-- webhook URL itself can't be guessed/spammed by third parties.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.agent_telegram_bot (
  agent_id uuid primary key references public.agent (agent_id) on delete cascade,
  bot_token text not null,
  bot_username text not null,
  webhook_secret text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
