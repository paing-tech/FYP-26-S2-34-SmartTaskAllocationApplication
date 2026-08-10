-- Backs the User Admin "Organization" free-form org chart canvas: one saved
-- position per person, and the free-form connections drawn between them.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.org_chart_node (
  user_id uuid primary key references public.user_account (user_id) on delete cascade,
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  pos_x integer not null default 0,
  pos_y integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists org_chart_node_organization_id_idx
  on public.org_chart_node (organization_id);

create table if not exists public.org_chart_connection (
  connection_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  from_user_id uuid not null references public.user_account (user_id) on delete cascade,
  to_user_id uuid not null references public.user_account (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, from_user_id, to_user_id)
);

create index if not exists org_chart_connection_organization_id_idx
  on public.org_chart_connection (organization_id);
