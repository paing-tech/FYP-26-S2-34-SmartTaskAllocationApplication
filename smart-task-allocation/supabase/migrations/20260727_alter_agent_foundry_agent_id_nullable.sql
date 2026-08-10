-- The Responses API (Azure's unified /openai/v1 surface) has no persistent
-- "assistant" resource to create — instructions/model are passed on every
-- call instead — so there is no Foundry-side agent id to store anymore.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent alter column foundry_agent_id drop not null;
