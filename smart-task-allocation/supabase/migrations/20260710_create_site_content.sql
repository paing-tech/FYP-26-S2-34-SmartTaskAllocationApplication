-- Backs the Platform Admin "Content" CMS page: one row per marketing-site
-- section (nav, hero, features, testimonials header, pricing, footer), each
-- storing that section's editable fields as JSON. Run this in the Supabase
-- SQL editor (Database > SQL Editor) for your project.
create table if not exists public.site_content (
  content_key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_account (user_id) on delete set null
);
