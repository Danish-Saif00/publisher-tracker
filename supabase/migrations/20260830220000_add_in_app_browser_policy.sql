alter table public.company_customizations
  add column if not exists blocked_in_app_browsers text[]
  not null
  default array[]::text[];
alter table public.company_customizations
  drop constraint if exists
    company_customizations_blocked_in_app_browsers_check;
alter table public.company_customizations
  add constraint company_customizations_blocked_in_app_browsers_check
  check (
    blocked_in_app_browsers <@ array[
      'snapchat',
      'instagram',
      'facebook',
      'messenger',
      'discord',
      'telegram',
      'tiktok',
      'other'
    ]::text[]
  );
comment on column public.company_customizations.blocked_in_app_browsers is
  'Company-controlled in-app browser categories that must stop before normal tracking click capture and destination redirect.';
