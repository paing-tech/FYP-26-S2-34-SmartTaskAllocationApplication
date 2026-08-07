-- Tracks which subscription plan an organization is on. There is no real
-- payment processor in this app — "upgrading" just sets this column
-- directly (see /api/organization-plan) — but the column itself is real so
-- feature-gating logic has something durable to check.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.organization
  add column if not exists plan text not null default 'starter';

do $$
begin
  alter table public.organization
    add constraint organization_plan_check check (plan in ('starter', 'pro', 'team'));
exception
  when duplicate_object then null;
end $$;
