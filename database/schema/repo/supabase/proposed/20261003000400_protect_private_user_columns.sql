-- ==================================================================
-- PROPOSED (NOT in migrations/ on purpose) — stop signed-in users reading each other's private data
-- ==================================================================
-- PROBLEM (reproduced on a rebuild of your schema):
--   users_select_all lets any signed-in session — including anonymous guest sessions — read EVERY row of `users`,
--   and `authenticated` has SELECT on every column. So any signed-in browser can run
--       select email, phone, age, gender, role, account_status, status_reason ... from users
--   and get everyone's. Your phone-sharing design says a phone is never exposed except through get_shared_phone().
--
-- FIX (same idea you already used for guests, applied to signed-in users):
--   Remove blanket SELECT from `authenticated`, then grant SELECT only on the public profile columns.
--   Private columns (email, phone, age, gender, role, permissions, status_reason, suspended_until, restricted_actions,
--   scheduled_deletion_at, auth_provider) become readable only through get_my_profile() (your own row).
--
-- PUBLIC columns granted (the guest list + the three RLS policies on listings/rentals need id, is_anonymous, account_status;
-- country_code was added by 20261003000500_country_and_public_phone.sql):
--   id, name, avatar_url, username, bio, city, country_code, last_active_at, shop_name, created_at, is_anonymous, account_status
--
-- NOTE: phone is NOT in that list on purpose. The app now reads other people's phone ONLY through get_user_phone()
-- (migration 20261003000500), so phone can stay a private column.
--
-- WHAT THIS CAN BREAK IN THE APP (find these BEFORE applying — see docs/PRIVACY_FIX.md):
--   * select('*') on users, or users(*) embedded in another query, now fails with "permission denied".
--     Select the public columns by name instead.
--   * Anything reading the SIGNED-IN USER'S OWN email / phone / age / gender / role / permissions / account status details
--     from the users table must call  supabase.rpc('get_my_profile')  instead.
--   * update/upsert on users that ends with .select() (RETURNING *) fails for private columns — drop the .select() or name public columns.
--   * Admin screens must use the admin_* functions (they are SECURITY DEFINER and unaffected).
--
-- Safe to re-run. Apply on STAGING first, click through the whole app, then live.
-- UNDO:  grant select on users to authenticated;      (puts back the old behaviour)
-- ==================================================================

revoke select on users from authenticated;

grant select (id, name, avatar_url, username, bio, city, country_code, last_active_at, shop_name, created_at, is_anonymous, account_status)
  on users to authenticated;

-- Logged-out visitors: re-assert the same guarantee (already set by guest_can_see_public_profiles + people_search;
-- repeated here so this file is self-contained and a later blanket GRANT can't silently re-open it).
revoke select on users from anon;
grant select (id, name, avatar_url, username, bio, city, country_code, last_active_at, shop_name) on users to anon;

-- Your own full row (including private columns). Returns nothing when not signed in.
create or replace function get_my_profile()
returns users
language sql
stable
security definer
set search_path = public
as $$
  select * from users where id = auth.uid();
$$;

revoke all on function get_my_profile() from public, anon;
grant execute on function get_my_profile() to authenticated;

notify pgrst, 'reload schema';
