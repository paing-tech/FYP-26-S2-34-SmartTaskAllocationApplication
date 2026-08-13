-- The Feature Gating toggle only ever offers "Starter" or "Pro / Team" —
-- selecting the latter should set the MINIMUM tier that unlocks it ('pro'),
-- so both Pro and Team orgs qualify via the plan-rank comparison in
-- PlanProvider.js. Any row still stored as 'team' (from before this
-- two-option toggle existed) incorrectly locks Pro-tier orgs out — this
-- backfills those rows to match current toggle semantics.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
update public.feature_flag
set required_plan = 'pro', updated_at = now()
where required_plan = 'team';
