-- Optional single-file attachment on a support inquiry (screenshot, log
-- file, etc). Public bucket + direct URL, same tradeoff as
-- leave-certificates: simpler than the private-bucket/signed-URL pattern
-- task_attachment uses, and the Platform Admin Inquiries list can just link
-- straight to the file with no extra endpoint.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.support_inquiry
  add column if not exists attachment_url text;

insert into storage.buckets (id, name, public)
values ('support-inquiry-attachments', 'support-inquiry-attachments', true)
on conflict (id) do nothing;
