-- Short, human-readable ticket ID (#00001, #00002, ...) for the Platform
-- Admin Support Tickets panel — inquiry_id is a UUID, not something anyone
-- would want to read or reference out loud. bigserial auto-assigns on
-- every future insert; existing rows get backfilled in whatever order
-- Postgres scans them, which is fine here since there's no ordering
-- guarantee promised for pre-existing tickets anyway.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.support_inquiry
  add column if not exists ticket_number bigserial;
