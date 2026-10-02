-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — shop names, @usernames, people search
-- PURPOSE   :
--   1) users.shop_name: an optional public name for someone's shop
--      (e.g. "Lendeia Tools"). NOT unique — two shops may share a name.
--   2) @username rules: usernames stay UNIQUE (the case-insensitive
--      unique index from profile_trust_fields.sql already exists), and
--      from now on a NEW or CHANGED username must be 3-20 characters of
--      letters, numbers, "_" or "."; it is stored lowercase without any
--      leading "@". Usernames that already exist are left untouched, so
--      nobody's account breaks. This is done in a trigger that only
--      checks when the username actually changes — a plain CHECK
--      constraint would have rejected every update to a row that still
--      has an old-style username, including the app's routine
--      sign-in sync.
--   3) search_people(): a public search over shops and people. A query
--      starting with "@" matches usernames only; anything else matches
--      shop name, display name, and username. It returns ONLY public
--      fields (never email/phone) and skips guest sessions and
--      banned / suspended / pending-deletion accounts. It also hides
--      anyone who has blocked the searcher, or whom the searcher has
--      blocked (blocked_users table, either direction).
--   4) Usernames must be truly distinct, not just different in
--      capitalisation: "RenzTools", "renztools", "renz_tools" and
--      "renz.tools" all count as the SAME name and only one can exist.
--      A short list of impersonation-prone names (admin, support,
--      lendeia, ...) is reserved. check_username_available() lets the
--      Profile form tell the person immediately, before they press Save.
--      Re-running this file is how you pick up changes to the above.
--   Run once in the Supabase SQL editor. Safe to run twice.
-- CONNECTS TO :
--   backend/supabase/people.js (searchPeople), profile.js, users.js,
--   frontend/pages/Browse/Browse.jsx, frontend/pages/Profile/Profile.jsx.
-- ==================================================================

alter table users add column if not exists shop_name text;

alter table users drop constraint if exists users_shop_name_length;
alter table users add constraint users_shop_name_length
  check (shop_name is null or char_length(btrim(shop_name)) between 2 and 50);

-- Guests (no session at all) may read the public shop name too.
grant select (shop_name) on users to anon;

-- ---- @username normalisation + format check (only when it changes) ----
create or replace function normalize_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new; -- unchanged: leave legacy usernames alone
  end if;
  new.username := lower(btrim(regexp_replace(new.username, '^@+', '')));
  if new.username = '' then
    new.username := null;
    return new;
  end if;
  if new.username !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'Username must be 3-20 characters: letters, numbers, "_" or ".".'
      using errcode = '23514';
  end if;
  if auth.uid() is not null and is_reserved_username(new.username) then
    raise exception 'That username is reserved. Please choose another.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_username on users;
create trigger trg_normalize_username
  before insert or update of username on users
  for each row execute function normalize_username();

-- ---- Usernames must be distinct once case, "." and "_" are ignored ----
-- (The original index only ignored case.) If two EXISTING accounts already
-- collide under this stricter rule the index is skipped with a notice, so
-- this migration never fails and never touches anyone's account; fix the
-- duplicates by hand and run the file again.
do $$
begin
  create unique index if not exists users_username_canonical_unique
    on users ((lower(replace(replace(username, '.', ''), '_', ''))))
    where username is not null;
exception when unique_violation then
  raise notice 'users_username_canonical_unique skipped: existing usernames collide once "." and "_" are ignored. Resolve them and run this file again.';
end $$;

-- Names nobody may take through the app (they look like official accounts).
-- Compared with "." and "_" removed. Changes made from the Supabase SQL
-- editor (no signed-in user) are exempt, so staff accounts can still be set.
create or replace function is_reserved_username(p_username text)
returns boolean
language sql
immutable
as $$
  select lower(replace(replace(coalesce(p_username, ''), '.', ''), '_', '')) = any (array[
    'admin', 'administrator', 'support', 'help', 'helpdesk', 'lendeia', 'lendeiasupport',
    'lendeiastaff', 'staff', 'team', 'moderator', 'mod', 'official', 'security', 'owner',
    'root', 'system', 'anonymous', 'guest', 'null', 'undefined'
  ]);
$$;

-- Tells the Profile form whether a username can be used BEFORE saving.
-- Returns one of: available | yours | taken | reserved | invalid
create or replace function check_username_available(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text := lower(btrim(regexp_replace(coalesce(p_username, ''), '^@+', '')));
begin
  if v_clean !~ '^[a-z0-9_.]{3,20}$' then
    return 'invalid';
  end if;
  if exists (
    select 1 from users
    where id = auth.uid()
      and lower(coalesce(username, '')) = v_clean
  ) then
    return 'yours';
  end if;
  if is_reserved_username(v_clean) then
    return 'reserved';
  end if;
  if exists (
    select 1 from users
    where id is distinct from auth.uid()
      and lower(replace(replace(coalesce(username, ''), '.', ''), '_', ''))
          = replace(replace(v_clean, '.', ''), '_', '')
  ) then
    return 'taken';
  end if;
  return 'available';
end;
$$;

grant execute on function check_username_available(text) to anon, authenticated;

-- ---- Public search over shops and people ----
create or replace function search_people(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  name text,
  shop_name text,
  username text,
  avatar_url text,
  city text,
  listing_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_query, ''));
  v_username_only boolean := left(v_raw, 1) = '@';
  v_term text := btrim(regexp_replace(v_raw, '^@+', ''));
  v_like text;
  v_prefix text;
begin
  if char_length(v_term) < 2 then
    return;
  end if;

  -- Treat %, _ and \ typed by the user as plain characters.
  v_term := lower(v_term);
  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_prefix := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    u.id,
    u.name,
    u.shop_name,
    u.username,
    u.avatar_url,
    u.city,
    (select count(*)::integer from listings l where l.owner_id = u.id and l.is_active) as listing_count
  from users u
  where coalesce(u.is_anonymous, false) = false
    and coalesce(u.account_status, 'active') in ('active', 'restricted')
    -- Hide anyone who has blocked the searcher, and anyone the searcher
    -- has blocked. blocked_users is read here with definer rights, since
    -- a person can't normally see who has blocked THEM.
    and not exists (
      select 1 from blocked_users b
      where (b.blocker_id = auth.uid() and b.blocked_id = u.id)
         or (b.blocker_id = u.id and b.blocked_id = auth.uid())
    )
    and (
      (v_username_only and lower(coalesce(u.username, '')) like v_like escape '\')
      or (not v_username_only and (
            lower(coalesce(u.shop_name, '')) like v_like escape '\'
         or lower(coalesce(u.name, '')) like v_like escape '\'
         or lower(coalesce(u.username, '')) like v_like escape '\'
      ))
    )
  order by
    -- exact match, then starts-with, then contains
    (lower(coalesce(u.username, '')) = v_term
      or lower(coalesce(u.shop_name, '')) = v_term
      or lower(coalesce(u.name, '')) = v_term) desc,
    (lower(coalesce(u.username, '')) like v_prefix escape '\'
      or lower(coalesce(u.shop_name, '')) like v_prefix escape '\'
      or lower(coalesce(u.name, '')) like v_prefix escape '\') desc,
    (select count(*) from listings l where l.owner_id = u.id and l.is_active) desc,
    u.name asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

grant execute on function search_people(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
