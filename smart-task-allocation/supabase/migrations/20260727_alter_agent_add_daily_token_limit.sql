-- Soft daily token cap per agent, shown as a progress bar on the Agent
-- page. 100000 is a starting default (see conversation) — safe headroom for
-- a mini-tier model without leaving a runaway loop unbounded; adjust per
-- agent later if you add a settings control for it.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent add column if not exists daily_token_limit integer not null default 100000;
