-- Pinned chats are shown above "Recents" in the Agent page's sidebar, via
-- the right-click context menu (Pin, Rename, Delete).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent_chat_thread add column if not exists pinned boolean not null default false;
