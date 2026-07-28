begin;
-- affiliate_tracker_email_notification_outbox_v1
--
-- Durable provider-neutral email notification outbox.
-- Sensitive template payloads and authentication links must be encrypted
-- before being written to email_notifications.
-- BullMQ jobs must contain only the email notification UUID.
create type public.email_notification_status as enum (
  'pending',
  'queued',
  'processing',
  'retry_scheduled',
  'sent',
  'failed',
  'cancelled'
);
create type public.email_delivery_attempt_status as enum (
  'processing',
  'sent',
  'failed'
);
create table public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies (id)
    on delete cascade,
  invitation_id uuid
    references public.company_invitations (id)
    on delete cascade,
  notification_type text not null,
  provider text not null default 'brevo',
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  template_code text not null,
  payload_ciphertext text not null,
  payload_iv text not null,
  payload_auth_tag text not null,
  idempotency_key text not null,
  status public.email_notification_status
    not null
    default 'pending',
  available_at timestamptz not null default now(),
  queued_at timestamptz,
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  last_error_code text,
  last_error_message text,
  provider_message_id text,
  created_by uuid default private.current_actor_user_id()
    references auth.users (id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_notifications_idempotency_key_unique
    unique (idempotency_key),
  constraint email_notifications_type_check
    check (
      char_length(notification_type) between 1 and 100
      and notification_type ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  constraint email_notifications_provider_check
    check (
      provider = 'brevo'
    ),
  constraint email_notifications_recipient_email_check
    check (
      recipient_email = lower(btrim(recipient_email))
      and char_length(recipient_email) between 3 and 320
      and recipient_email ~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint email_notifications_recipient_name_check
    check (
      recipient_name is null
      or char_length(btrim(recipient_name)) between 1 and 200
    ),
  constraint email_notifications_subject_check
    check (
      char_length(btrim(subject)) between 1 and 300
    ),
  constraint email_notifications_template_code_check
    check (
      char_length(template_code) between 1 and 120
      and template_code ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  constraint email_notifications_payload_ciphertext_check
    check (
      char_length(payload_ciphertext) between 1 and 65535
    ),
  constraint email_notifications_payload_iv_check
    check (
      char_length(payload_iv) between 8 and 256
    ),
  constraint email_notifications_payload_auth_tag_check
    check (
      char_length(payload_auth_tag) between 8 and 256
    ),
  constraint email_notifications_idempotency_key_check
    check (
      char_length(idempotency_key) between 1 and 240
    ),
  constraint email_notifications_attempt_count_check
    check (
      attempt_count >= 0
      and max_attempts between 1 and 20
      and attempt_count <= max_attempts
    ),
  constraint email_notifications_error_code_check
    check (
      last_error_code is null
      or char_length(btrim(last_error_code)) between 1 and 120
    ),
  constraint email_notifications_error_message_check
    check (
      last_error_message is null
      or char_length(btrim(last_error_message)) between 1 and 1000
    ),
  constraint email_notifications_provider_message_id_check
    check (
      provider_message_id is null
      or char_length(btrim(provider_message_id)) between 1 and 500
    ),
  constraint email_notifications_invitation_reference_check
    check (
      notification_type <> 'company_invitation'
      or invitation_id is not null
    ),
  constraint email_notifications_terminal_state_check
    check (
      (
        status = 'sent'
        and sent_at is not null
        and failed_at is null
        and cancelled_at is null
      )
      or (
        status = 'failed'
        and failed_at is not null
        and sent_at is null
        and cancelled_at is null
      )
      or (
        status = 'cancelled'
        and cancelled_at is not null
        and sent_at is null
        and failed_at is null
      )
      or (
        status in (
          'pending',
          'queued',
          'processing',
          'retry_scheduled'
        )
        and sent_at is null
        and failed_at is null
        and cancelled_at is null
      )
    )
);
create table public.email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.email_notifications (id)
    on delete cascade,
  attempt_number integer not null,
  provider text not null default 'brevo',
  status public.email_delivery_attempt_status
    not null
    default 'processing',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_message_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint email_delivery_attempts_notification_attempt_unique
    unique (notification_id, attempt_number),
  constraint email_delivery_attempts_attempt_number_check
    check (
      attempt_number between 1 and 20
    ),
  constraint email_delivery_attempts_provider_check
    check (
      provider = 'brevo'
    ),
  constraint email_delivery_attempts_provider_message_id_check
    check (
      provider_message_id is null
      or char_length(btrim(provider_message_id)) between 1 and 500
    ),
  constraint email_delivery_attempts_error_code_check
    check (
      error_code is null
      or char_length(btrim(error_code)) between 1 and 120
    ),
  constraint email_delivery_attempts_error_message_check
    check (
      error_message is null
      or char_length(btrim(error_message)) between 1 and 1000
    ),
  constraint email_delivery_attempts_completion_check
    check (
      (
        status = 'processing'
        and completed_at is null
        and provider_message_id is null
        and error_code is null
        and error_message is null
      )
      or (
        status = 'sent'
        and completed_at is not null
        and provider_message_id is not null
        and error_code is null
        and error_message is null
      )
      or (
        status = 'failed'
        and completed_at is not null
        and error_code is not null
      )
    )
);
create index email_notifications_due_dispatch_idx
  on public.email_notifications (
    available_at,
    created_at,
    id
  )
  where status in (
    'pending',
    'retry_scheduled'
  );
create index email_notifications_company_status_idx
  on public.email_notifications (
    company_id,
    status,
    created_at desc,
    id desc
  );
create index email_notifications_invitation_idx
  on public.email_notifications (
    invitation_id,
    created_at desc
  )
  where invitation_id is not null;
create index email_notifications_processing_started_idx
  on public.email_notifications (
    processing_started_at,
    id
  )
  where status = 'processing';
create index email_delivery_attempts_notification_started_idx
  on public.email_delivery_attempts (
    notification_id,
    started_at desc,
    id desc
  );
create trigger email_notifications_set_updated_at
before update on public.email_notifications
for each row
execute function private.set_updated_at();
alter table public.email_notifications
  enable row level security;
alter table public.email_delivery_attempts
  enable row level security;
revoke all
  on table public.email_notifications
  from anon, authenticated;
revoke all
  on table public.email_delivery_attempts
  from anon, authenticated;
comment on table public.email_notifications is
  'Durable email notification outbox. Authentication links and dynamic template payloads are stored only as authenticated encrypted values.';
comment on table public.email_delivery_attempts is
  'Sanitized provider delivery-attempt history. Provider credentials, authentication links, and complete message payloads must never be stored here.';
comment on column public.email_notifications.idempotency_key is
  'Stable business-event key used to block duplicate notification creation and duplicate queue scheduling.';
comment on column public.email_notifications.payload_ciphertext is
  'Encrypted JSON template payload. It may contain a short-lived authentication action link and must never be returned through public APIs.';
comment on column public.email_notifications.provider_message_id is
  'Brevo transactional message identifier returned after successful provider acceptance.';
commit;