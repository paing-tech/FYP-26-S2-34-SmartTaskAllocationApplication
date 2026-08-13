alter table public.user_account
  add column if not exists requested_role_id bigint references public.role (role_id) on delete set null,
  add column if not exists requested_organization_id uuid references public.organization (organization_id) on delete set null;

