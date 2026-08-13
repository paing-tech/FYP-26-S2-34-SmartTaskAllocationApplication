-- Plan-change entries now display the organization name rather than every
-- member's email (that fan-out is reserved for the Team-tier-only logging
-- change in the app code) — denormalized here the same way
-- account_activity_log.target_label already is, so reads don't need a join.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.platform_activity_log
  add column if not exists organization_name text;
