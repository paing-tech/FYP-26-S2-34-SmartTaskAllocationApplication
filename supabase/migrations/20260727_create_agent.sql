-- One Foundry Agent per manager. Instructions are cached here so the
-- Agent page can edit/display them without round-tripping to Foundry, then
-- pushed to Foundry via update-agent whenever they change.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.agent (
  agent_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  user_id uuid not null unique references public.user_account (user_id) on delete cascade,
  name text not null,
  foundry_agent_id text not null,
  foundry_deployment_name text not null,
  foundry_vector_store_id text,
  instructions text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_organization_id_idx on public.agent (organization_id);
