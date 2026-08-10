-- Private storage bucket for raw knowledge-base documents uploaded on the
-- Agent page (PDFs, docs). Unlike leave-certificates this is NOT public —
-- these may contain internal company instructions/resources, so files are
-- only readable via the server (service-role client) or a signed URL.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
insert into storage.buckets (id, name, public)
values ('agent-knowledge', 'agent-knowledge', false)
on conflict (id) do nothing;
