-- Adds date of birth + gender to profile, and a per-user qualifications list
-- (free-text entries, not a shared catalog like skill/user_skill) for the
-- redesigned profile detail card.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.profile
  add column if not exists date_of_birth date,
  add column if not exists gender text;

create table if not exists public.user_qualification (
  user_qualification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_qualification_user_id_idx
  on public.user_qualification (user_id);
