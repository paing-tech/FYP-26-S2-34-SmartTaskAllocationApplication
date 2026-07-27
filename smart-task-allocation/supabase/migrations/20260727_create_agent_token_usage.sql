-- Append-only token usage log. Foundry returns token counts per run/call;
-- each call logs one row here, and the Agent page's left-side usage panel
-- sums over this table (Foundry itself doesn't expose a historical usage
-- query API).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.agent_token_usage (
  agent_token_usage_id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent (agent_id) on delete cascade,
  organization_id uuid not null references public.organization (organization_id) on delete cascade,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists agent_token_usage_agent_id_idx on public.agent_token_usage (agent_id);
create index if not exists agent_token_usage_created_at_idx on public.agent_token_usage (created_at);
