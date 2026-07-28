begin;
-- affiliate_tracker_short_tracking_codes_v1
--
-- New tracking links use 16-character opaque hexadecimal codes.
-- Existing 40-character tracking links remain valid.
alter table public.tracking_links
  drop constraint if exists tracking_links_tracking_code_check;
alter table public.tracking_links
  add constraint tracking_links_tracking_code_check
  check (
    tracking_code = lower(tracking_code)
    and (
      tracking_code ~ '^[a-f0-9]{16}$'
      or tracking_code ~ '^[a-f0-9]{40}$'
    )
  );
commit;