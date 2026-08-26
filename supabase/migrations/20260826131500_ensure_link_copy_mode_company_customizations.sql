alter table public.company_customizations
  add column if not exists link_copy_mode text not null default 'both';
alter table public.company_customizations
  drop constraint if exists company_customizations_link_copy_mode_check;
alter table public.company_customizations
  add constraint company_customizations_link_copy_mode_check
  check (
    link_copy_mode in (
      'both',
      'clickable_only',
      'plain_text_only'
    )
  );
comment on column public.company_customizations.link_copy_mode is
  'Controls which tracking-link copy formats publishers may use: both, clickable_only, or plain_text_only.';