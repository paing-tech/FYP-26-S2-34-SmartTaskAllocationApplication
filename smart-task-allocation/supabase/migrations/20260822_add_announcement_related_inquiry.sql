-- Links a targeted reply announcement back to the support ticket it came
-- from, so the notification bell can offer an "open ticket" action —
-- global broadcasts and plan-change entries just leave this null.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.announcement
  add column if not exists related_inquiry_id uuid references public.support_inquiry (inquiry_id) on delete set null;

create index if not exists announcement_related_inquiry_id_idx
  on public.announcement (related_inquiry_id);
