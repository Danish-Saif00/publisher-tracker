begin;

-- tracking_clicks remain immutable after capture except for narrowly-scoped
-- tracker runtime enrichment. The trusted context is transaction-local and
-- is enabled only around the two application-owned Proxy/GEO persistence
-- statements.
--
-- Core click identity, ownership, offer/network/domain snapshots, request
-- metadata, captured_at and DELETE remain immutable.
--
-- attribution_eligible may only move from true to false.

create or replace function private.prevent_tracking_click_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  trusted_tracking_click_runtime_write boolean;
  old_immutable jsonb;
  new_immutable jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception
      using
        errcode = '42501',
        message = 'Captured tracking clicks are immutable.';
  end if;

  trusted_tracking_click_runtime_write :=
    coalesce(
      current_setting(
        'app.tracking_click_runtime_write',
        true
      ),
      ''
    ) = 'on';

  if not trusted_tracking_click_runtime_write then
    raise exception
      using
        errcode = '42501',
        message = 'Captured tracking clicks are immutable.';
  end if;

  old_immutable :=
    to_jsonb(old)
    - array[
        'proxy_detection_outcome',
        'proxy_provider_code',
        'proxy_risk_score',
        'proxy_is_proxy',
        'proxy_is_vpn',
        'proxy_is_tor',
        'proxy_failure_code',
        'proxy_decision_snapshot',
        'proxy_checked_at',
        'attribution_eligible'
      ]::text[];

  new_immutable :=
    to_jsonb(new)
    - array[
        'proxy_detection_outcome',
        'proxy_provider_code',
        'proxy_risk_score',
        'proxy_is_proxy',
        'proxy_is_vpn',
        'proxy_is_tor',
        'proxy_failure_code',
        'proxy_decision_snapshot',
        'proxy_checked_at',
        'attribution_eligible'
      ]::text[];

  if new_immutable is distinct from old_immutable then
    raise exception
      using
        errcode = '42501',
        message =
          'Captured tracking click immutable fields cannot be changed.';
  end if;

  if not old.attribution_eligible
    and new.attribution_eligible
  then
    raise exception
      using
        errcode = '42501',
        message =
          'Captured tracking click attribution eligibility cannot be re-enabled.';
  end if;

  return new;
end;
$function$;

comment on function private.prevent_tracking_click_mutation() is
  'Preserves captured click immutability while allowing transaction-local trusted tracker runtime enrichment of Proxy/GEO decision fields. DELETE and core click mutations remain prohibited; attribution eligibility can only be disabled.';

commit;
