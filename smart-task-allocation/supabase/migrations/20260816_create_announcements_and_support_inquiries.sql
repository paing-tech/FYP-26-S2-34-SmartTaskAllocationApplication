-- Notification system: platform-wide announcements a Platform Admin
-- broadcasts to every user. Delivery is global (no fan-out row per user) —
-- only "seen" state is per-user, tracked in announcement_read.
-- Also adds support_inquiry, backing "Contact Support" in the profile menu:
-- any user can submit one, Platform Admin reviews/resolves them.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.announcement (
  announcement_id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.user_account (user_id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists announcement_created_at_idx
  on public.announcement (created_at desc);

create table if not exists public.announcement_read (
  announcement_id uuid not null references public.announcement (announcement_id) on delete cascade,
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.support_inquiry (
  inquiry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  organization_id uuid references public.organization (organization_id) on delete set null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_inquiry_status_idx
  on public.support_inquiry (status, created_at desc);
