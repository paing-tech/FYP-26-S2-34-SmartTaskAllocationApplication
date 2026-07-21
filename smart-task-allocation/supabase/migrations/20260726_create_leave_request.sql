-- Self-service leave requests backing the Attendance page's "Request Leave"
-- section. "dates" is a plain date[] since a request can cover several
-- non-contiguous days picked from a multi-select calendar.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.leave_request (
  leave_request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  dates date[] not null,
  description text,
  is_emergency boolean not null default false,
  certificate_url text,
  status text not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_request_user_id_idx on public.leave_request (user_id);
