-- Defensive counterpart to 20260808_reconcile_task_comment_created_by.sql —
-- task_comment turned out to already exist in this database under a
-- different column name (created_by instead of user_id), so task_attachment
-- may have the same pre-existing shape. No-op if task_attachment doesn't
-- exist yet or already uses user_id.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'task_attachment'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'task_attachment' and column_name = 'created_by'
    ) then
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'task_attachment' and column_name = 'user_id'
      ) then
        update public.task_attachment set user_id = created_by where user_id is null;
        alter table public.task_attachment alter column user_id set not null;
        alter table public.task_attachment drop column created_by;
      else
        alter table public.task_attachment rename column created_by to user_id;
      end if;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
