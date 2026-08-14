-- Formalizes the "testimonial" table backing the public marketing site's
-- testimonials section (src/app/api/public-testimonials/route.js) — it
-- already exists live in this project (created directly via the SQL editor,
-- predating this migrations folder, same situation "skill" was in before
-- 20260824_add_skill_organization_id.sql), so this is written to be safe
-- either way: `create table if not exists` gives a fresh environment the
-- full canonical shape, and the `alter table` below adds the new
-- AI-curation columns/constraint to the already-existing live table.
--
-- Backs the new "curate testimonials from feedback" flow: a Platform Admin
-- (via a UI button or the curate_testimonials agent tool) has the AI read
-- support_inquiry rows with subject = 'Feedback' and draft candidate
-- testimonials as status 'Pending' — never shown publicly until a human
-- approves them (see the status filter tightened in
-- public-testimonials/route.js in this same change).
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.

create table if not exists public.testimonial (
  testimonial_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_account (user_id) on delete cascade,
  rating smallint,
  testimonial_message text not null,
  is_featured boolean not null default false,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

-- Traces a curated testimonial back to the feedback it was drafted from —
-- also how the curation endpoint avoids re-drafting the same inquiry twice.
alter table public.testimonial
  add column if not exists source_inquiry_id uuid references public.support_inquiry (inquiry_id) on delete set null;

-- The table predates this migration with no documented status values —
-- safe to constrain now (0 rows in this project as of writing).
alter table public.testimonial
  drop constraint if exists testimonial_status_check;
alter table public.testimonial
  add constraint testimonial_status_check check (status in ('Pending', 'Approved', 'Rejected'));

alter table public.testimonial
  drop constraint if exists testimonial_rating_check;
alter table public.testimonial
  add constraint testimonial_rating_check check (rating is null or (rating between 1 and 5));

create index if not exists testimonial_status_idx
  on public.testimonial (status, created_at desc);

create unique index if not exists testimonial_source_inquiry_id_key
  on public.testimonial (source_inquiry_id)
  where source_inquiry_id is not null;
