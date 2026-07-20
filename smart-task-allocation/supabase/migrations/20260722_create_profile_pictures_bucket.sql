-- Public storage bucket for user-uploaded profile pictures. Uploads always go
-- through the server (service-role client), which bypasses storage RLS, so no
-- storage policies are needed here — the bucket just needs to exist and be
-- public so the resulting URLs are directly usable in <img>/<Image>.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;
