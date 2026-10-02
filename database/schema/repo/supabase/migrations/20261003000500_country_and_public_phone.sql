-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — country on listings + people, always-visible phone (new)
-- RUN BEFORE: deploying the matching app code (the app now reads country_code and calls
--             get_user_phone; without this file the app errors on sign-in).
-- PURPOSE   :
--   1) Country support — the app no longer assumes every listing is in the Philippines.
--        listings.country_code / users.country_code  = ISO 3166-1 alpha-2 ("PH", "US", "JP").
--      Existing listings/people keep NULL (never guessed); the owner is asked to pick a country
--      the next time they edit. NEW listings must have one (checked by trigger below).
--   2) get_user_phone(user_id) — replaces the old "both sides must opt in" phone sharing.
--      A phone number is shown on a person's store / profile page and next to rentals when they
--      added one. It is returned only to a signed-in, real (non-guest) account that isn't blocked
--      either way with that person. The old set_phone_shared / get_shared_phone functions are left
--      in place (unused) so nothing else breaks; the rental opt-in columns are simply no longer read.
--   3) get_owner_all_listings now also returns country_code.
-- SAFE TO RE-RUN : yes (idempotent).
-- ROLLBACK       : at the bottom of this file (commented).
-- ==================================================================

-- ---------- 1. country columns ----------
alter table users    add column if not exists country_code text;
alter table listings add column if not exists country_code text;

alter table users drop constraint if exists users_country_code_format;
alter table users add constraint users_country_code_format
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

alter table listings drop constraint if exists listings_country_code_format;
alter table listings add constraint listings_country_code_format
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

-- New listings must say which country they are in. Done as an INSERT trigger (not a NOT NULL
-- constraint) so old listings without a country keep working and can still be paused / relisted.
create or replace function require_listing_country()
returns trigger
language plpgsql
as $$
begin
  if new.country_code is null then
    raise exception 'Please choose the country this item is in.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_listing_country on listings;
create trigger trg_require_listing_country
  before insert on listings
  for each row execute function require_listing_country();

create index if not exists idx_listings_country on listings (country_code) where country_code is not null;

-- Country is public profile information (like city), readable the same way.
grant select (country_code) on users to authenticated;
grant select (country_code) on users to anon;

-- ---------- 2. always-visible phone ----------
create or replace function get_user_phone(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_caller_anon boolean;
  v_caller_stat text;
  v_phone       text;
begin
  if v_uid is null or p_user_id is null then
    return null;
  end if;

  select is_anonymous, account_status into v_caller_anon, v_caller_stat
  from users where id = v_uid;

  -- guests and restricted/suspended/banned callers don't get phone numbers
  if not found or coalesce(v_caller_anon, true) or v_caller_stat is distinct from 'active' then
    return null;
  end if;

  -- your own number is always yours to read
  if v_uid = p_user_id then
    select phone into v_phone from users where id = v_uid;
    return nullif(btrim(v_phone), '');
  end if;

  -- blocked in either direction -> nothing
  if exists (
    select 1 from blocked_users
    where (blocker_id = v_uid and blocked_id = p_user_id)
       or (blocker_id = p_user_id and blocked_id = v_uid)
  ) then
    return null;
  end if;

  select phone into v_phone
  from users
  where id = p_user_id
    and is_anonymous = false
    and account_status in ('active', 'restricted');   -- not banned / suspended / pending deletion

  return nullif(btrim(v_phone), '');
end;
$$;

revoke all on function get_user_phone(uuid) from public, anon;
grant execute on function get_user_phone(uuid) to authenticated;

-- ---------- 3. owner listings now include the country ----------
drop function if exists get_owner_all_listings(uuid);
create or replace function get_owner_all_listings(p_owner_id uuid)
returns table (
  id uuid,
  name text,
  brand text,
  model text,
  category text,
  price_per_day numeric,
  condition text,
  description text,
  location text,
  country_code text,
  latitude double precision,
  longitude double precision,
  primary_image_url text,
  photo_urls text[],
  is_active boolean,
  plan text,
  plan_expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.id, l.name, l.brand, l.model, l.category, l.price_per_day, l.condition, l.description,
    l.location, l.country_code, l.latitude, l.longitude, l.primary_image_url, l.photo_urls, l.is_active, l.plan,
    l.plan_expires_at, l.created_at
  from listings l
  where l.owner_id = p_owner_id
  order by l.created_at desc;
$$;
grant execute on function get_owner_all_listings(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- ROLLBACK (run by hand only if needed) ----------
-- drop trigger if exists trg_require_listing_country on listings;
-- drop function if exists require_listing_country();
-- drop function if exists get_user_phone(uuid);
-- alter table listings drop constraint if exists listings_country_code_format;
-- alter table users    drop constraint if exists users_country_code_format;
-- alter table listings drop column if exists country_code;
-- alter table users    drop column if exists country_code;
-- (then re-run history/listings/58_public_store_shows_delisted.sql to restore the old get_owner_all_listings)
