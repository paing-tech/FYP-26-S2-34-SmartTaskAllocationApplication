-- Appeals a suspended user submits from the login screen, asking a User
-- Admin to review and reactivate their account. One pending appeal per
-- account at a time; resolving it (approve/dismiss) is a User Admin action.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.account_appeal (
  appeal_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists account_appeal_organization_id_idx
  on public.account_appeal (organization_id, status, created_at desc);
