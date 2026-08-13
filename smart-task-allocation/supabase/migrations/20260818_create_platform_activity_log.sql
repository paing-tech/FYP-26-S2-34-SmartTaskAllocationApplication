-- Cross-org activity feed for the Platform Admin dashboard's Activity Logs
-- panel. Unlike account_activity_log (one organization, one target user per
-- row — what a User Admin sees), this spans every organization and some
-- entries are inherently org-wide: a plan change touching the "team" tier
-- affects every member of that organization, so `emails` is an array
-- rather than a single target.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.platform_activity_log (
  activity_id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organization (organization_id) on delete cascade,
  type text not null check (type in ('joined', 'suspended', 'activated', 'plan_change')),
  emails text[] not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists platform_activity_log_created_at_idx
  on public.platform_activity_log (created_at desc);
