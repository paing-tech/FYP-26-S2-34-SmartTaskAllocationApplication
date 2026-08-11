-- Tags how each task_assignment row happened, so Allocation Efficiency
-- reporting can tell "assigned in the same request the task was created"
-- apart from "a manager later picked someone via the Employee Assignment
-- modal" apart from "Optimus AI (or the chat agent) auto-assigned it at
-- creation" — all three currently look identical (just a row with
-- assigned_by + assigned_at).
-- Nullable: existing rows predate this and stay untagged (excluded from
-- method-specific reporting rather than guessed at).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.task_assignment
  add column if not exists assignment_method text
  check (assignment_method in ('task_creation', 'manual_modal', 'ai_auto'));
