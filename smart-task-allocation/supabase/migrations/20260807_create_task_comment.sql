-- Comments left on a task from the task details panel (currently the
-- Employee workspace's task-details card). One row per comment, keyed to
-- the author.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.task_comment (
  comment_id uuid primary key default gen_random_uuid(),
  task_id integer not null references public.task (task_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comment_task_id_idx on public.task_comment (task_id);
