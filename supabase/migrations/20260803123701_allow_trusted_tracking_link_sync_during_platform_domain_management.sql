begin;
-- Permit only trusted, trigger-driven tracking-link synchronization while a
-- Platform Super Admin manages the lifecycle of a tracking domain.
--
-- Direct Platform Super Admin writes to company operational data remain
-- prohibited. The bypass applies only to public.tracking_links while the
-- controlled security-definer synchronization helper has explicitly enabled
-- app.tracking_link_system_write for the current transaction.
create or replace function private.reject_platform_super_admin_operational_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  trusted_tracking_link_system_write boolean;
begin
  trusted_tracking_link_system_write :=
    tg_table_schema = 'public'
    and tg_table_name = 'tracking_links'
    and coalesce(
      current_setting('app.tracking_link_system_write', true),
      'false'
    ) = 'true';
  if private.is_platform_super_admin()
    and not trusted_tracking_link_system_write
  then
    raise exception
      using
        errcode = '42501',
        message = 'Platform Super Admin cannot modify company operational data.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
revoke all
on function private.reject_platform_super_admin_operational_write()
from public, anon, authenticated;
grant execute
on function private.reject_platform_super_admin_operational_write()
to service_role;
comment on function private.reject_platform_super_admin_operational_write() is
  'Rejects Platform Super Admin operational writes except trusted system-generated tracking-link synchronization explicitly enabled by the controlled tracking-link helper.';
commit;
