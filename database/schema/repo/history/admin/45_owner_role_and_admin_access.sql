-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — owner/admin role + admin access (new)
-- PURPOSE   :
--   Adds a real `role` column to users (owner/admin/user, default
--   'user') and lets owner/admin accounts see and manage ALL
--   support_requests (including the existing report_listing/
--   report_user categories) instead of just their own — the missing
--   piece support_requests_insert_own/select_own left for later,
--   noted directly in help_support_requests.sql's own comment.
--   Security is enforced here, at the database level, not by any
--   frontend check — the app never lets a client set their own role
--   to owner/admin (see the UPDATE policy below, which explicitly
--   excludes changing `role`); that column is only ever set directly
--   in the Supabase dashboard by whoever runs this SQL, for their own
--   account.
-- CONNECTS TO :
--   backend/supabase/admin.js, frontend/pages/Admin/Admin.jsx.
-- ==================================================================

alter table users
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin', 'owner'));

-- Real access control for the reports/support queue — previously only
-- the submitter themselves could ever see their own row, so nobody
-- (not even the account meant to review them) could actually read the
-- full queue. is_admin_or_owner() is defined SECURITY DEFINER so the
-- policies below can check the caller's role without needing a
-- separate, broader "read all users" policy just to support this.
create or replace function is_admin_or_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'owner') from users where id = auth.uid()),
    false
  );
$$;

drop policy if exists support_requests_select_own on support_requests;
create policy support_requests_select_own on support_requests
  for select using (user_id = auth.uid() or is_admin_or_owner());

drop policy if exists support_requests_admin_update on support_requests;
create policy support_requests_admin_update on support_requests
  for update using (is_admin_or_owner())
  with check (is_admin_or_owner());

-- A normal user updating their OWN profile must never be able to grant
-- themselves admin/owner through the same update path everything else
-- (name, bio, avatar, etc.) goes through — this trigger blocks any
-- attempted change to `role` unless the caller already has
-- admin/owner, closing that off at the database level regardless of
-- what the client sends.
create or replace function block_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_admin_or_owner() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_self_role_escalation on users;
create trigger trg_block_self_role_escalation
  before update on users
  for each row execute function block_self_role_escalation();

notify pgrst, 'reload schema';
