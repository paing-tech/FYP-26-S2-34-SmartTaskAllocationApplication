-- Current multi-assignee set for a task (separate from task_assignment, which
-- is the historical allocation-history log). Run this in the Supabase SQL
-- editor (Database > SQL Editor) for your project.
create table if not exists public.task_assignee (
  task_id integer not null references public.task (task_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_assignee_user_id_idx on public.task_assignee (user_id);
