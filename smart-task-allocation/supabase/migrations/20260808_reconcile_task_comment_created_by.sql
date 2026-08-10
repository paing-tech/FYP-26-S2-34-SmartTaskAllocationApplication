-- task_comment already existed in this database with an author column
-- named created_by (not null, no default) rather than user_id — the
-- earlier `create table if not exists` migration was a no-op against it,
-- and 20260808_fix_task_comment_schema.sql added a separate (empty,
-- nullable) user_id column instead of reusing it. Reconcile onto a single
-- user_id column so inserts (which only set user_id) satisfy every
-- not-null constraint on the table.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_comment' and column_name = 'created_by'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'task_comment' and column_name = 'user_id'
    ) then
      -- Both columns exist: user_id is the empty one added by the earlier
      -- repair migration. Backfill it from created_by, then drop created_by.
      update public.task_comment set user_id = created_by where user_id is null;
      alter table public.task_comment alter column user_id set not null;
      alter table public.task_comment drop column created_by;
    else
      alter table public.task_comment rename column created_by to user_id;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
