-- Org-wide weekly work-hour limit a User Admin can configure — the
-- Attendance page's weekly-hours donut turns red once the signed-in
-- user's hours worked this week reach or exceed it.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.organization
  add column if not exists weekly_hour_limit numeric not null default 40;
