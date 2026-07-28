begin;
alter table public.company_customizations
  add column link_identifier_mode text
    not null
    default 'slug_or_code',
  add column plain_text_sharing_enabled boolean
    not null
    default true,
  add column restricted_share_platforms text[]
    not null
    default array[
      'snapchat',
      'instagram',
      'facebook'
    ]::text[],
  add column default_link_query_parameters jsonb
    not null
    default '{}'::jsonb;
alter table public.company_customizations
  add constraint company_customizations_link_identifier_mode_check
    check (
      link_identifier_mode in (
        'slug_or_code',
        'tracking_code'
      )
    ),
  add constraint company_customizations_restricted_share_platforms_check
    check (
      restricted_share_platforms
        <@ array[
          'snapchat',
          'instagram',
          'facebook'
        ]::text[]
      and cardinality(restricted_share_platforms) <= 3
    ),
  add constraint company_customizations_default_link_query_parameters_check
    check (
      jsonb_typeof(default_link_query_parameters) = 'object'
    );
comment on column
  public.company_customizations.link_identifier_mode is
  'Controls whether displayed links prefer a custom slug or always use the immutable tracking code.';
comment on column
  public.company_customizations.plain_text_sharing_enabled is
  'Enables generation of a deliberately non-clickable plain-text representation for selected social platforms.';
comment on column
  public.company_customizations.restricted_share_platforms is
  'Platforms for which the interface offers plain-text link copying. Supported values are snapchat, instagram, and facebook.';
comment on column
  public.company_customizations.default_link_query_parameters is
  'Company-level default query parameters merged into newly created tracking links.';
commit;