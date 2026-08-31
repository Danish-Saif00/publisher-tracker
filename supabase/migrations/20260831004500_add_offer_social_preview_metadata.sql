begin;
alter table public.offers
  add column if not exists social_preview_title text,
  add column if not exists social_preview_image_url text;
alter table public.offers
  drop constraint if exists offers_social_preview_title_check,
  add constraint offers_social_preview_title_check
    check (
      social_preview_title is null
      or char_length(btrim(social_preview_title)) between 1 and 160
    );
alter table public.offers
  drop constraint if exists offers_social_preview_image_url_check,
  add constraint offers_social_preview_image_url_check
    check (
      social_preview_image_url is null
      or (
        char_length(btrim(social_preview_image_url)) between 8 and 2048
        and social_preview_image_url ~* '^https?://'
      )
    );
create or replace function private.enforce_archived_offer_social_preview_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.status = 'archived'
    and (
      new.social_preview_title is distinct from old.social_preview_title
      or new.social_preview_image_url is distinct from old.social_preview_image_url
    )
  then
    raise exception
      using
        errcode = '23514',
        message = 'An archived offer is immutable.';
  end if;
  return new;
end;
$function$;
drop trigger if exists offers_enforce_archived_social_preview_immutability
on public.offers;
create trigger offers_enforce_archived_social_preview_immutability
before update of social_preview_title, social_preview_image_url
on public.offers
for each row
execute function private.enforce_archived_offer_social_preview_immutability();
commit;
