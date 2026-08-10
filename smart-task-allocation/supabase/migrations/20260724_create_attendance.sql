-- Attendance clock-in/clock-out log, one open (clock_out_at is null) row per
-- user at a time. Face verification happens client-side (face-api.js); the
-- distance score/verified flag are stored for audit only, not re-checked here.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.attendance (
  attendance_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  work_date date not null default (now() at time zone 'utc')::date,
  clock_in_at timestamptz not null default now(),
  clock_in_verified boolean not null default false,
  clock_in_distance numeric,
  clock_out_at timestamptz,
  clock_out_verified boolean,
  clock_out_distance numeric,
  total_hours numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_user_id_idx on public.attendance (user_id);
create index if not exists attendance_user_open_idx
  on public.attendance (user_id, clock_out_at)
  where clock_out_at is null;
