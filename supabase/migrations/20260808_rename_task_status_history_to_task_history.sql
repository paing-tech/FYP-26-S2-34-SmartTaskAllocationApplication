-- Renames task_status_history to task_history (and its PK column
-- task_status_history_id to task_history_id) to match the app's naming.
-- Uses ALTER TABLE ... RENAME rather than a fresh CREATE TABLE so any rows
-- already in task_status_history are preserved, not orphaned.
-- Safe to run even if already renamed (no-op via the existence checks).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'task_status_history'
  ) then
    alter table public.task_status_history rename to task_history;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_history' and column_name = 'task_status_history_id'
  ) then
    alter table public.task_history rename column task_status_history_id to task_history_id;
  end if;
end $$;

alter index if exists task_status_history_task_id_idx rename to task_history_task_id_idx;
alter index if exists task_status_history_user_id_idx rename to task_history_user_id_idx;
alter index if exists task_status_history_changed_at_idx rename to task_history_changed_at_idx;

notify pgrst, 'reload schema';
