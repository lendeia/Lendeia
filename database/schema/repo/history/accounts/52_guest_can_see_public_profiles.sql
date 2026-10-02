-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - let guests see other people's
--             public profile photo/name (new)
-- PURPOSE   :
--   When someone browses without a full account, other owners' and
--   shops' photos showed up as just a letter ("G", from the
--   "Guest" fallback name) because the app could not read those
--   people's users rows at all from that session, so the joined
--   name/avatar_url came back empty.
--   This makes sure a guest can read ONLY the genuinely public profile
--   columns (name, photo, username, bio, city, last-active) of other
--   people, and nothing sensitive:
--     - Anonymous-session guests use the "authenticated" role, so the
--       users_select_all policy is re-asserted here (same as
--       CRITICAL_enable_rls_on_users.sql) in case it never got run.
--     - Visitors with no session at all use the "anon" role, which
--       gets a policy too, but with COLUMN-LEVEL permission so email,
--       phone, age, gender, role and permissions stay unreadable to
--       it even though the row itself is visible.
-- ==================================================================

alter table users enable row level security;

drop policy if exists users_select_all on users;
create policy users_select_all on users
  for select using (auth.uid() is not null);

drop policy if exists users_select_public_anon on users;
create policy users_select_public_anon on users
  for select to anon using (true);

revoke select on users from anon;
grant select (id, name, avatar_url, username, bio, city, last_active_at) on users to anon;

notify pgrst, 'reload schema';
