-- Web ("Recents") and Telegram conversations both map to a Foundry Thread,
-- so a manager's chat history carries context across messages. Telegram
-- threads carry a telegram_chat_id so the webhook can find the right thread
-- for an incoming message instead of starting a fresh one every time.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.agent_chat_thread (
  agent_chat_thread_id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent (agent_id) on delete cascade,
  foundry_thread_id text not null,
  title text not null default 'New chat',
  source text not null default 'web' check (source in ('web', 'telegram')),
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_chat_thread_agent_id_idx on public.agent_chat_thread (agent_id);
create index if not exists agent_chat_thread_telegram_chat_id_idx on public.agent_chat_thread (telegram_chat_id);
