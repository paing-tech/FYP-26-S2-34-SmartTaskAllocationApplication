-- Lets the public marketing site's "Contact Us" form submit into the same
-- support_inquiry table/Platform Admin review queue that logged-in users'
-- Contact Support already uses, instead of standing up a second, separate
-- inbox — a public visitor has no user_account row, so user_id has to
-- become optional, with guest_name/guest_email carrying identification
-- instead. Existing (logged-in-user) rows are unaffected.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.

alter table public.support_inquiry
  alter column user_id drop not null;

alter table public.support_inquiry
  add column if not exists guest_name text;
alter table public.support_inquiry
  add column if not exists guest_email text;

-- Every ticket must be traceable to *someone* — either a real account, or
-- a guest's name + email.
alter table public.support_inquiry
  drop constraint if exists support_inquiry_submitter_check;
alter table public.support_inquiry
  add constraint support_inquiry_submitter_check
  check (user_id is not null or (guest_name is not null and guest_email is not null));
