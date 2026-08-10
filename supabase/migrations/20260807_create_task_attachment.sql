-- Files attached to a task from the task details panel. Stores only the
-- storage_path (private bucket, see 20260807_create_task_attachments_bucket.sql)
-- — reads always go through the server so a signed URL can be minted per
-- request rather than a public URL.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.task_attachment (
  attachment_id uuid primary key default gen_random_uuid(),
  task_id integer not null references public.task (task_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists task_attachment_task_id_idx on public.task_attachment (task_id);
