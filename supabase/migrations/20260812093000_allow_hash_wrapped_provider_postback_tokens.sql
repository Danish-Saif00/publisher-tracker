begin;

-- Keep the database provider-token contract aligned with API validation.
-- Ordinary tokens remain subject to trimming/length/URL safety checks.
-- A hash character is accepted only when the complete token is a
-- hash-wrapped provider macro such as #s2# or #s8#.

alter table public.network_provider_integration_configurations
drop constraint network_provider_integration_click_token_check;

alter table public.network_provider_integration_configurations
add constraint network_provider_integration_click_token_check
check (
  "postback_click_id_token" is null
  or (
    char_length("postback_click_id_token") between 1 and 240
    and "postback_click_id_token" = btrim("postback_click_id_token")
    and "postback_click_id_token" !~ '[[:cntrl:]&=?]'
    and (
      position('#' in "postback_click_id_token") = 0
      or "postback_click_id_token" ~ '^#[A-Za-z0-9_.-]+#$'
    )
  )
);

alter table public.network_provider_integration_configurations
drop constraint network_provider_integration_conversion_token_check;

alter table public.network_provider_integration_configurations
add constraint network_provider_integration_conversion_token_check
check (
  "postback_conversion_id_token" is null
  or (
    char_length("postback_conversion_id_token") between 1 and 240
    and "postback_conversion_id_token" = btrim("postback_conversion_id_token")
    and "postback_conversion_id_token" !~ '[[:cntrl:]&=?]'
    and (
      position('#' in "postback_conversion_id_token") = 0
      or "postback_conversion_id_token" ~ '^#[A-Za-z0-9_.-]+#$'
    )
  )
);

alter table public.network_provider_integration_configurations
drop constraint network_provider_integration_revenue_amount_token_check;

alter table public.network_provider_integration_configurations
add constraint network_provider_integration_revenue_amount_token_check
check (
  "postback_revenue_amount_token" is null
  or (
    char_length("postback_revenue_amount_token") between 1 and 240
    and "postback_revenue_amount_token" = btrim("postback_revenue_amount_token")
    and "postback_revenue_amount_token" !~ '[[:cntrl:]&=?]'
    and (
      position('#' in "postback_revenue_amount_token") = 0
      or "postback_revenue_amount_token" ~ '^#[A-Za-z0-9_.-]+#$'
    )
  )
);

alter table public.network_provider_integration_configurations
drop constraint network_provider_integration_revenue_currency_token_check;

alter table public.network_provider_integration_configurations
add constraint network_provider_integration_revenue_currency_token_check
check (
  "postback_revenue_currency_token" is null
  or (
    char_length("postback_revenue_currency_token") between 1 and 240
    and "postback_revenue_currency_token" = btrim("postback_revenue_currency_token")
    and "postback_revenue_currency_token" !~ '[[:cntrl:]&=?]'
    and (
      position('#' in "postback_revenue_currency_token") = 0
      or "postback_revenue_currency_token" ~ '^#[A-Za-z0-9_.-]+#$'
    )
  )
);

commit;
