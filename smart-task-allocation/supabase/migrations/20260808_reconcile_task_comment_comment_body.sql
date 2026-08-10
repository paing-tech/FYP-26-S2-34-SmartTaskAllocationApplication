-- Same story as 20260808_reconcile_task_comment_created_by.sql: the
-- pre-existing task_comment table also stores the comment text in a column
-- named comment_body (not null, no default) rather than comment_text.
-- 20260808_fix_task_comment_schema.sql added a separate (empty) comment_text
-- column instead of reusing it. Reconcile onto a single comment_text column
-- so inserts (which only set comment_text) satisfy every not-null
-- constraint on the table.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_comment' and column_name = 'comment_body'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'task_comment' and column_name = 'comment_text'
    ) then
      update public.task_comment set comment_text = comment_body where comment_text is null or comment_text = '';
      alter table public.task_comment alter column comment_text set not null;
      alter table public.task_comment drop column comment_body;
    else
      alter table public.task_comment rename column comment_body to comment_text;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
