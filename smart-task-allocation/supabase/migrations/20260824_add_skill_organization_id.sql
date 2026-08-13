-- Skills were a single global catalog shared across every organization
-- (see the comment this replaces in src/app/api/skills/route.js). Scoping
-- them per-org means two different orgs can each have their own "Excel"
-- skill without colliding, so the old global-unique constraint on
-- skill_name has to become a composite (organization_id, skill_name)
-- constraint instead.
--
-- This only adds the column and index — it does NOT backfill existing rows
-- (see 20260824_backfill_skill_organization_id.sql for that) and does NOT
-- make the column NOT NULL, since 59 of the 73 existing skill rows have no
-- usage anywhere to infer an owning org from (see that script's comments).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.skill
  add column if not exists organization_id uuid references public.organization (organization_id) on delete cascade;

create index if not exists skill_organization_id_idx
  on public.skill (organization_id);

-- Postgres's default name for a single-column UNIQUE constraint is
-- <table>_<column>_key — this is what `skill_name varchar unique` would
-- have produced. Drop it before adding the composite one below (a plain
-- unique index under a different name, if that's how it was actually
-- created, would need to be dropped by its real name instead — check
-- \d skill in the SQL editor first if this statement errors).
alter table public.skill
  drop constraint if exists skill_skill_name_key;

-- organization_id is nullable, so this only enforces uniqueness among rows
-- that already have one assigned — orphaned (null) rows are exempt.
create unique index if not exists skill_organization_id_skill_name_key
  on public.skill (organization_id, skill_name)
  where organization_id is not null;
