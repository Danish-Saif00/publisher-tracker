begin;
-- Preserve the manually verified production privilege correction.
-- Authenticated users must not directly delete provider integration configuration rows.
revoke delete
on table public.network_provider_integration_configurations
from authenticated;
commit;