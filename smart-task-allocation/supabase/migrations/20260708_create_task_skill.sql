-- Required-skills junction table for tasks, mirroring user_skill's shape.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.task_skill (
  task_id integer not null references public.task (task_id) on delete cascade,
  skill_id integer not null references public.skill (skill_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (task_id, skill_id)
);

create index if not exists task_skill_skill_id_idx on public.task_skill (skill_id);

-- Optional: if your other tables have RLS enabled, do the same here for
-- consistency (the app itself talks to Supabase via the service-role key,
-- which bypasses RLS, so this is defense-in-depth rather than required).
-- alter table public.task_skill enable row level security;
