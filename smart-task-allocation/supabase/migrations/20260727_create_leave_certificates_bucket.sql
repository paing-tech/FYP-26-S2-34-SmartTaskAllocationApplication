-- Public storage bucket for uploaded medical certificates attached to leave
-- requests. Uploads always go through the server (service-role client),
-- which bypasses storage RLS, so no storage policies are needed here.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
insert into storage.buckets (id, name, public)
values ('leave-certificates', 'leave-certificates', true)
on conflict (id) do nothing;
