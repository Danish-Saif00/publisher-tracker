begin;
alter table public.company_customizations
  add column tagline text,
  add column default_currency text,
  add column default_timezone text;
alter table public.company_customizations
  add constraint company_customizations_tagline_check
    check (
      tagline is null
      or char_length(btrim(tagline)) between 1 and 240
    ),
  add constraint company_customizations_default_currency_check
    check (
      default_currency is null
      or btrim(default_currency) ~ '^[A-Z]{3}$'
    ),
  add constraint company_customizations_default_timezone_check
    check (
      default_timezone is null
      or char_length(btrim(default_timezone)) between 1 and 100
    );
comment on column public.company_customizations.tagline is
  'Optional short company or platform tagline used by supported interfaces and email templates.';
comment on column public.company_customizations.default_currency is
  'Optional three-letter ISO currency code used as the company operational default.';
comment on column public.company_customizations.default_timezone is
  'Optional IANA timezone used as the company customization and reporting default.';
commit;