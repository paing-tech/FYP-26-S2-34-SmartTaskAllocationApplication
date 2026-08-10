-- Backs the free-form department boundary rectangles on the User Admin
-- "Organization" canvas: one saved position + size per department, since
-- rectangles are now placed and resized independently of member positions.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.org_chart_department (
  department_id bigint primary key references public.department (department_id) on delete cascade,
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  pos_x integer not null default 0,
  pos_y integer not null default 0,
  width integer not null default 420,
  height integer not null default 320,
  updated_at timestamptz not null default now()
);

create index if not exists org_chart_department_organization_id_idx
  on public.org_chart_department (organization_id);
