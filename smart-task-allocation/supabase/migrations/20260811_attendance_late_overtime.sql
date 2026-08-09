-- Persists how many minutes late/early a clock-in was, and how many minutes
-- overtime/under a clock-out was, computed against that day's scheduled
-- start/end time — kept for future insights rather than only shown live.
-- Positive = late / overtime, negative = early / left early, null = there
-- was no schedule set for that day when the clock event happened.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.attendance
  add column if not exists late_minutes integer;

alter table public.attendance
  add column if not exists overtime_minutes integer;
