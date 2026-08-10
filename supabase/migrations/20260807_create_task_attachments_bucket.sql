-- Private storage bucket for task attachments — task descriptions/comments
-- may reference internal, non-public files, so this mirrors agent-knowledge
-- (private, server/signed-URL access only) rather than profile-pictures.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;
