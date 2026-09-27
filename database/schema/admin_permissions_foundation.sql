-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — granular admin permissions (new)
-- PURPOSE   :
--   Extends owner_role_and_admin_access.sql's role column so future
--   staff accounts can each have their OWN login with a SPECIFIC,
--   limited set of permissions (support, moderation, finance, etc.)
--   instead of every admin getting the same full access, or the owner
--   having to share their own login. Per explicit request, this is
--   ONLY the underlying authorization model — no "invite staff" UI,
--   no admin-management page, and no actual staff accounts exist yet.
--   The point is that adding those later is a small, additive change
--   (grant specific permissions to a new admin row) rather than a
--   schema rewrite or an auth-system replacement.
--   The owner role always has full access to everything, regardless of
--   the permissions array — permissions only ever LIMIT an 'admin'
--   account, they never apply to 'owner'. There is intentionally only
--   ever one practical way to become owner: it's set directly in the
--   database (see owner_role_and_admin_access.sql), never granted
--   through the app, and there's no "transfer ownership" or "manage
--   admins" capability built yet either — those are future work, not
--   part of this foundation.
-- CONNECTS TO :
--   backend/supabase/admin.js's getMyRole()/getMyPermissions();
--   has_permission() is meant for FUTURE RLS policies on whatever new
--   admin surfaces get built (e.g. a future finance/subscriptions
--   view could require has_permission('finance') instead of the
--   broader is_admin_or_owner()).
-- ==================================================================

alter table users
  add column if not exists permissions text[] not null default '{}';

-- True for the owner unconditionally, or for an admin whose
-- permissions array contains the given scope. Scope names are just
-- plain text on purpose (not an enum) — adding a new one later (e.g.
-- 'finance', 'moderation') needs no migration, just granting it to a
-- specific admin's row.
create or replace function has_permission(perm text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'owner' or (role = 'admin' and perm = any(permissions)) from users where id = auth.uid()),
    false
  );
$$;

-- A normal user (or a limited admin) must never be able to grant
-- themselves — or anyone else — broader permissions or the admin/owner
-- role through the same profile-update path everything else (name,
-- bio, avatar) goes through. Only an existing owner can change role or
-- permissions on any row, including their own; this replaces the
-- role-only version of this trigger from owner_role_and_admin_access.sql
-- now that permissions exist too.
create or replace function block_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.permissions is distinct from old.permissions)
     and not (select role = 'owner' from users where id = auth.uid()) then
    new.role := old.role;
    new.permissions := old.permissions;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
