-- Append-only log of task status changes, keyed to the actor who made the
-- change — this is what powers the Employee workspace's "Activity Log"
-- (scoped to that employee's own actions). Nothing else in the schema
-- records who changed a task's status and when (task.updated_at has no
-- actor or from/to). Run this in the Supabase SQL editor (Database > SQL
-- Editor) for your project.
create table if not exists public.task_status_history (
  task_status_history_id uuid primary key default gen_random_uuid(),
  task_id integer not null references public.task (task_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now()
);

create index if not exists task_status_history_task_id_idx on public.task_status_history (task_id);
create index if not exists task_status_history_user_id_idx on public.task_status_history (user_id);
create index if not exists task_status_history_changed_at_idx on public.task_status_history (changed_at);
