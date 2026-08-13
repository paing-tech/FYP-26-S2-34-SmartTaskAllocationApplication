-- Lets an announcement target a single user instead of always being a
-- global broadcast — backs Platform Admin replying to a support ticket
-- from the notification bell rather than a new person-to-person messaging
-- system. Null stays a global announcement (existing behavior unchanged).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.announcement
  add column if not exists target_user_id uuid references public.user_account (user_id) on delete cascade;

create index if not exists announcement_target_user_id_idx
  on public.announcement (target_user_id);
