-- The Responses API has no "list messages in a thread" endpoint the way the
-- old Assistants Threads API did — conversation continuity is just a
-- previous_response_id chain — so the transcript has to be kept ourselves
-- for the chat panel to redisplay history. foundry_thread_id is no longer
-- created up front either, since there's no thread resource to create.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent_chat_thread alter column foundry_thread_id drop not null;
alter table public.agent_chat_thread add column if not exists last_response_id text;
alter table public.agent_chat_thread add column if not exists messages jsonb not null default '[]'::jsonb;
