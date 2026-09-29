-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - Trust & Safety foundation (new)
-- PURPOSE   :
--   Real account status (active/restricted/suspended/banned), an
--   admin action audit log, and enforcement of that status at the
--   database level - not just something the frontend chooses to
--   respect. This is a scoped-down slice of a much larger Trust &
--   Safety proposal: status + moderation actions + audit log +
--   enforcement + user notice. Deliberately NOT included here:
--   automatic suspicious-activity flagging, an appeals system, phone
--   verification, and finer-grained admin roles beyond the existing
--   owner/admin/permissions split - those are real, separate pieces
--   of future work, not shipped in this pass.
--   Security is enforced here, in the database, exactly like the
--   existing owner/admin system: is_admin_or_owner() (already defined
--   in owner_role_and_admin_access.sql) gates every write below, and
--   a suspended/banned account's OWN session cannot change its own
--   status back - only an admin/owner row-write can.
-- CONNECTS TO :
--   backend/supabase/admin.js's applyAccountAction()/getUserModerationInfo();
--   backend/supabase/anonymousAuth.js's ensureAnonymousSession() (login-time
--   enforcement); frontend/pages/Admin/Admin.jsx (the action buttons);
--   frontend/layouts/MainLayout.jsx (the affected user's own status banner).
-- ==================================================================

alter table users
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'restricted', 'suspended', 'banned')),
  add column if not exists status_reason text,
  add column if not exists suspended_until timestamptz,
  -- e.g. {'create_listing','send_message'} - which specific actions a
  -- restricted account can't do; empty means "restricted" is noted but
  -- nothing is actually blocked yet (a soft flag), matching the
  -- document's "restricted, not suspended" distinction.
  add column if not exists restricted_actions text[] not null default '{}';

-- ---- Audit log — every moderation action, who did it, when, why ----
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users(id) on delete restrict,
  target_user_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('warn', 'restrict', 'unrestrict', 'suspend', 'unsuspend', 'ban', 'unban')),
  reason text not null,
  -- only meaningful for 'suspend' — how long, so the record shows what
  -- was actually decided even after the suspension itself has expired
  -- and users.suspended_until has been cleared.
  suspended_until timestamptz,
  related_report_id uuid references support_requests(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table admin_actions enable row level security;

drop policy if exists admin_actions_select on admin_actions;
create policy admin_actions_select on admin_actions
  for select using (is_admin_or_owner());

drop policy if exists admin_actions_insert on admin_actions;
create policy admin_actions_insert on admin_actions
  for insert with check (is_admin_or_owner() and admin_id = auth.uid());

-- ---- Let admin/owner actually change someone else's status ----
-- The existing users_update_own policy only ever allowed a person to
-- update their OWN row — there was no way for an admin to change
-- anyone else's account_status/restricted_actions/suspended_until at
-- all before this.
drop policy if exists users_admin_update_status on users;
create policy users_admin_update_status on users
  for update using (is_admin_or_owner())
  with check (is_admin_or_owner());

-- ---- Extend notifications so a moderation notice can be sent ----
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'rental_request_received', 'request_accepted', 'request_declined',
  'new_message', 'payment_successful', 'new_review', 'account_action'
));

-- ---- Auto-expiring suspensions ----
-- Called at login (and safe to call anywhere else that reads account
-- status) - if a suspension's time has passed, flips the account back
-- to active right there rather than requiring anyone to remember to
-- manually lift it. Real changes only happen when actually expired;
-- otherwise this is a no-op.
create or replace function expire_suspension_if_due(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update users
  set account_status = 'active', suspended_until = null, status_reason = null
  where id = target
    and account_status = 'suspended'
    and suspended_until is not null
    and suspended_until <= now();
end;
$$;

-- ---- Close a real gap: block self-un-banning ----
-- block_self_role_escalation() (admin_permissions_foundation.sql)
-- already stops a user granting themselves role/permissions through
-- the normal profile-update path — but it never covered these new
-- status columns, which use that SAME path (users_update_own).
-- Without this, a banned/suspended/restricted account could simply
-- update its own row back to account_status='active' itself, since
-- users_update_own's policy allows updating any column on your own
-- row. Redefining the same function (the trigger calling it already
-- exists) to also guard these columns the identical way.
create or replace function block_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- role/permissions stay OWNER-only to change, unchanged from
  -- admin_permissions_foundation.sql's original intent — an admin
  -- granting themselves or anyone else more admin power is a
  -- different, more sensitive thing than an admin applying a
  -- moderation action, and deliberately isn't allowed here.
  if (new.role is distinct from old.role or new.permissions is distinct from old.permissions)
     and not (select role = 'owner' from users where id = auth.uid()) then
    new.role := old.role;
    new.permissions := old.permissions;
  end if;

  -- Moderation status fields: owner OR admin, matching
  -- is_admin_or_owner() used everywhere else a moderation action is
  -- authorized — but never the target's OWN session, however senior,
  -- self-moderating your own account status makes no sense and this
  -- blocks it same as anyone else's self-escalation attempt.
  if (
    new.account_status is distinct from old.account_status
    or new.suspended_until is distinct from old.suspended_until
    or new.restricted_actions is distinct from old.restricted_actions
    or new.status_reason is distinct from old.status_reason
  ) and (
    auth.uid() = old.id
    or not (select role in ('owner', 'admin') from users where id = auth.uid())
  ) then
    new.account_status := old.account_status;
    new.suspended_until := old.suspended_until;
    new.restricted_actions := old.restricted_actions;
    new.status_reason := old.status_reason;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
