-- Audit trail for the User Admin dashboard's "Activity Logs" section:
-- approve pending, suspend, activate, promote, demote, delete actions.
-- target_label is a denormalized snapshot of the target account's display
-- name at the time of the action, so the log entry stays readable even
-- after a deleted account's target_user_id is nulled out below.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.account_activity_log (
  activity_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  actor_user_id uuid not null references public.user_account (user_id) on delete cascade,
  target_user_id uuid references public.user_account (user_id) on delete set null,
  target_label text,
  action text not null check (action in ('approve', 'suspend', 'activate', 'promote', 'demote', 'delete')),
  details text,
  created_at timestamptz not null default now()
);

create index if not exists account_activity_log_organization_id_idx
  on public.account_activity_log (organization_id, created_at desc);
