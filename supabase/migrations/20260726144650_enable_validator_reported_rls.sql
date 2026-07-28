begin;

-- affiliate_tracker_missing_rls_repair_v2
-- Enables RLS only for existing public tables explicitly
-- reported by scripts/validate-migrations.mjs.

alter table public.company_proxy_configurations enable row level security;

alter table public.proxy_detection_cache enable row level security;

commit;
