-- Agent avatar is picked from a fixed set of mascot images shipped in
-- /public (see src/lib/agentAvatars.js) — this column just stores which key
-- the Agent page's edit mode selected.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent add column if not exists avatar_key text not null default 'blue';
