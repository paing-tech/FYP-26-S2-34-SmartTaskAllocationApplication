-- Org-wide active-task limit a User Admin can configure — Insights'
-- Workload Distribution chart marks anyone over this as Overloaded and
-- draws it as the chart's red "Limit" threshold line.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.organization
  add column if not exists workload_task_limit numeric not null default 8;
