-- Adds "ai_assisted" to task_assignment.assignment_method: a manager clicked
-- "Assign with AI" in the Employee Assignment modal on an existing task —
-- AI picked the match, but a human triggered it, later than task creation.
-- Counts as an AI assignment for the AI-vs-Manual ratio (assigned_by stays
-- "Optimus AI"), but is kept out of the "ai_auto" Allocation Time average
-- since that's specifically the automatic-at-creation processing time, not
-- however long it took a manager to click the button.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.task_assignment drop constraint if exists task_assignment_assignment_method_check;
alter table public.task_assignment
  add constraint task_assignment_assignment_method_check
  check (assignment_method in ('task_creation', 'manual_modal', 'ai_auto', 'ai_assisted'));
