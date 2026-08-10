-- Repairs task_comment if it already existed (from a partial/earlier run)
-- without the columns 20260807_create_task_comment.sql expects — that
-- migration uses `create table if not exists`, which is a no-op if a
-- table with that name is already present, even with a different shape.
-- Safe to run even if the table is already correct.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.task_comment
  add column if not exists comment_text text;

update public.task_comment
  set comment_text = ''
  where comment_text is null;

alter table public.task_comment
  alter column comment_text set not null;

alter table public.task_comment
  add column if not exists created_at timestamptz not null default now();

alter table public.task_comment
  add column if not exists task_id integer;

alter table public.task_comment
  add column if not exists user_id uuid;

notify pgrst, 'reload schema';
