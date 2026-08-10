-- Additional audit fields used by the attendance acceptance tests.
-- Safe to run repeatedly in Supabase SQL Editor before deploying this branch.
alter table if exists public.attendance
  add column if not exists task_id integer references public.task(task_id) on delete set null,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists break_minutes integer not null default 0,
  add column if not exists timezone text not null default 'UTC';

create index if not exists attendance_task_id_idx on public.attendance(task_id);
