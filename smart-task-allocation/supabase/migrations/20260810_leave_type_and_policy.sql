-- Replaces the unused is_emergency flag with leave_type — the app now
-- decides annual vs. sick automatically (a request with an attached
-- medical certificate counts as sick leave, otherwise annual). Also adds
-- the org-wide annual/sick leave day totals a User Admin can configure
-- (see /api/organization-leave-policy), which the Leave Balance panel
-- divides real usage against.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.leave_request
  drop column if exists is_emergency;

alter table public.leave_request
  add column if not exists leave_type text not null default 'annual';

do $$
begin
  alter table public.leave_request
    add constraint leave_request_leave_type_check check (leave_type in ('annual', 'sick'));
exception
  when duplicate_object then null;
end $$;

alter table public.organization
  add column if not exists annual_leave_total integer not null default 16;

alter table public.organization
  add column if not exists sick_leave_total integer not null default 14;
