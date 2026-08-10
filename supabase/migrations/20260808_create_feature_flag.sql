-- Registry of gated features and the minimum plan tier each one requires.
-- The app checks this table at the specific points already wired to call
-- it (Optimus AI chat, AI auto-assign, Allocation History) — Platform
-- Admin can change WHICH tier unlocks each of those checkpoints here, but
-- adding a brand new checkpoint still requires wiring the guard() call
-- into that feature's code.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.feature_flag (
  feature_key text primary key,
  feature_name text not null,
  description text,
  required_plan text not null default 'starter' check (required_plan in ('starter', 'pro', 'team')),
  updated_at timestamptz not null default now()
);

insert into public.feature_flag (feature_key, feature_name, description, required_plan)
values
  (
    'optimus_ai',
    'Optimus AI Chat',
    'Chat with Optimus AI, including prompt-to-automation task creation.',
    'pro'
  ),
  (
    'ai_auto_assign',
    'AI Auto-Assign',
    'Let Optimus AI automatically pick the best-matching employee for a task.',
    'pro'
  ),
  (
    'allocation_history',
    'Allocation History',
    'View the full expanded allocation history with smart reassignment.',
    'pro'
  )
on conflict (feature_key) do nothing;
