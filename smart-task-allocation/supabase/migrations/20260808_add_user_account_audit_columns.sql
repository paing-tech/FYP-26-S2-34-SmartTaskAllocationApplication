-- Adds the columns the new Pending Invitations section needs (who invited
-- an account and when) — user_account predates this repo's tracked
-- migrations, so these are defensive `add column if not exists`, safe to
-- run even if some of them already exist.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.user_account
  add column if not exists invited_by uuid references public.user_account (user_id) on delete set null;

alter table public.user_account
  add column if not exists created_at timestamptz not null default now();

alter table public.user_account
  add column if not exists updated_at timestamptz not null default now();

notify pgrst, 'reload schema';
