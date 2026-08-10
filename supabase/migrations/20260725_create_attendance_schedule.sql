-- Per-day work schedule (planned start/end time) backing the Attendance
-- page's month calendar. One row per user per calendar date; the "Full-time"
-- repeat control bulk-upserts several dates at once with the same times.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.attendance_schedule (
  schedule_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists attendance_schedule_user_date_idx
  on public.attendance_schedule (user_id, work_date);
