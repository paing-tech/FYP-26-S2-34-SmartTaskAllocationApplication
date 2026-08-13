-- Backfills organization_id on existing skill rows, derived from how each
-- skill is actually used — run AFTER 20260824_add_skill_organization_id.sql.
--
-- Live counts at the time this was written: 73 skill rows total, but only
-- 14 are referenced by any user_skill row (17 links total) and 0 of those
-- 14 are used by people in more than one organization, so a clean 1:1
-- backfill is possible for them. The remaining ~59 rows aren't linked to
-- any user OR any task, so there's no signal anywhere to infer an owning
-- org from — this script deliberately leaves those as organization_id =
-- null rather than guessing. Decide separately whether to delete them
-- (they're unused) or manually assign them to a specific org.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.

-- Step 1: backfill from user_skill -> user_account.organization_id.
-- distinct on picks one org per skill; live data confirms no skill
-- actually spans more than one, so this is safe as written.
update public.skill s
set organization_id = sub.organization_id
from (
  select distinct on (us.skill_id)
    us.skill_id,
    ua.organization_id
  from public.user_skill us
  join public.user_account ua on ua.user_id = us.user_id
  where ua.organization_id is not null
  order by us.skill_id, ua.organization_id
) sub
where s.skill_id = sub.skill_id
  and s.organization_id is null;

-- Step 2: catch any skill only ever referenced as a task's required skill
-- (not tied to any specific user) via task.organization_id instead.
update public.skill s
set organization_id = sub.organization_id
from (
  select distinct on (ts.skill_id)
    ts.skill_id,
    t.organization_id
  from public.task_skill ts
  join public.task t on t.task_id = ts.task_id
  where t.organization_id is not null
  order by ts.skill_id, t.organization_id
) sub
where s.skill_id = sub.skill_id
  and s.organization_id is null;

-- Sanity check after running: this should return the ~59 unreferenced rows
-- still needing a manual decision (delete vs. assign vs. leave as a
-- shared/legacy catalog).
-- select skill_id, skill_name from public.skill where organization_id is null;
