begin;

create type public.company_invitation_status as enum (
  'pending',
  'accepted',
  'revoked'
);

create type public.company_invitation_delivery_status as enum (
  'pending',
  'sent',
  'failed'
);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  email text not null,
  role public.company_role not null,
  status public.company_invitation_status not null default 'pending',
  delivery_status public.company_invitation_delivery_status not null default 'pending',
  token_hash text not null,
  user_id uuid
    references auth.users (id)
    on delete set null,
  requires_password_setup boolean not null default false,
  invited_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0,
  last_delivery_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_invitations_company_email_unique
    unique (company_id, email),

  constraint company_invitations_token_hash_unique
    unique (token_hash),

  constraint company_invitations_email_normalized_check
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),

  constraint company_invitations_token_hash_check
    check (
      token_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint company_invitations_expiry_check
    check (
      expires_at > created_at
    ),

  constraint company_invitations_send_count_check
    check (
      send_count >= 0
    ),

  constraint company_invitations_delivery_error_check
    check (
      last_delivery_error_code is null
      or char_length(btrim(last_delivery_error_code)) between 1 and 120
    ),

  constraint company_invitations_status_timestamps_check
    check (
      (status = 'accepted' and accepted_at is not null and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null and accepted_at is null)
      or (status = 'pending' and accepted_at is null and revoked_at is null)
    )
);

create index company_invitations_company_status_created_at_idx
  on public.company_invitations (
    company_id,
    status,
    created_at desc,
    id desc
  );

create index company_invitations_user_id_idx
  on public.company_invitations (user_id)
  where user_id is not null;

create trigger company_invitations_set_updated_at
before update on public.company_invitations
for each row
execute function private.set_updated_at();

alter table public.company_invitations
  enable row level security;

create policy company_invitations_select_management
on public.company_invitations
for select
to authenticated
using (
  private.has_company_role(
    company_id,
    array[
      'company_admin',
      'manager'
    ]::public.company_role[]
  )
);

create policy company_invitations_insert_company_admin
on public.company_invitations
for insert
to authenticated
with check (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

create policy company_invitations_update_company_admin
on public.company_invitations
for update
to authenticated
using (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
)
with check (
  private.has_company_role(
    company_id,
    array['company_admin']::public.company_role[]
  )
);

revoke all
on public.company_invitations
from anon, authenticated;

grant select (
  id,
  company_id,
  email,
  role,
  status,
  delivery_status,
  user_id,
  requires_password_setup,
  invited_by,
  expires_at,
  accepted_at,
  revoked_at,
  last_sent_at,
  send_count,
  last_delivery_error_code,
  created_at,
  updated_at
)
on public.company_invitations
to authenticated;

grant insert (
  company_id,
  email,
  role,
  status,
  delivery_status,
  token_hash,
  user_id,
  requires_password_setup,
  invited_by,
  expires_at
)
on public.company_invitations
to authenticated;

grant update (
  role,
  status,
  delivery_status,
  token_hash,
  user_id,
  requires_password_setup,
  expires_at,
  accepted_at,
  revoked_at,
  last_sent_at,
  send_count,
  last_delivery_error_code
)
on public.company_invitations
to authenticated;

grant all
on public.company_invitations
to service_role;

commit;
