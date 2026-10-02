-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — enforced admin functions (new)
-- RUN AFTER : 20261003000000_admin_audit_log.sql
-- PURPOSE   :
--   Turns the owner/admin/permission rules into DATABASE-ENFORCED functions.
--   An admin page (or any client) calls these with supabase.rpc(...); the
--   database checks who is signed in (auth.uid()) — nobody can pass in
--   "who they are", unlike the SQL Editor snippets.
--
--   scope        who passes
--   ----------   ----------------------------------------------------
--   owner        owner only
--   moderation   owner, or admin that has 'moderation' in permissions
--   support      owner, or admin that has 'support'
--   finance      owner, or admin that has 'finance'
--   staff        owner or any admin
--   In every case the account must be 'active' (a suspended admin is locked out).
--
--   Every change is logged: account actions + listing removals in
--   admin_actions, everything else in admin_audit_log.
-- SAFE TO RE-RUN : yes (create or replace).
-- ROLLBACK  : supabase/rollback/admin_layer_rollback.sql
-- ==================================================================

-- ---------- internal gate (not callable from the app) ----------
create or replace function admin_require(p_scope text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_perms  text[];
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select role, permissions, account_status
    into v_role, v_perms, v_status
  from users where id = v_uid;

  if not found or v_status is distinct from 'active' then
    raise exception 'Account not allowed' using errcode = '42501';
  end if;

  if v_role = 'owner' then
    return v_uid;
  end if;

  if p_scope = 'owner' then
    raise exception 'Owner only' using errcode = '42501';
  end if;

  if v_role = 'admin' and (p_scope = 'staff' or p_scope = any (v_perms)) then
    return v_uid;
  end if;

  raise exception 'Permission denied' using errcode = '42501';
end;
$$;

-- ---------- account actions: warn / restrict / suspend / ban / undo ----------
create or replace function admin_account_action(
  p_target    uuid,
  p_action    text,
  p_reason    text,
  p_days      integer default null,
  p_report_id uuid    default null
)
returns admin_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid;
  v_actor_role   text;
  v_target_role  text;
  v_target_state text;
  v_until        timestamptz;
  v_row          admin_actions;
begin
  v_actor := admin_require('moderation');
  select role into v_actor_role from users where id = v_actor;

  if p_action is null or p_action not in
     ('warn','restrict','unrestrict','suspend','unsuspend','ban','unban') then
    raise exception 'Unknown action: %', p_action using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot act on yourself' using errcode = '42501';
  end if;

  select role, account_status into v_target_role, v_target_state
  from users where id = p_target;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'An owner cannot be actioned' using errcode = '42501';
  end if;
  if v_target_role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can act on an admin' using errcode = '42501';
  end if;
  if v_target_state = 'pending_deletion' and p_action <> 'warn' then
    raise exception 'Account is pending deletion; an owner must cancel the deletion first'
      using errcode = '55000';
  end if;

  if p_action = 'suspend' then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'A suspension needs 1 to 365 days' using errcode = '22023';
    end if;
    v_until := now() + make_interval(days => p_days);
  end if;

  if p_action <> 'warn' then
    update users
    set account_status = case p_action
          when 'restrict' then 'restricted'
          when 'suspend'  then 'suspended'
          when 'ban'      then 'banned'
          else 'active' end,
        status_reason   = case when p_action in ('restrict','suspend','ban') then btrim(p_reason) else null end,
        suspended_until = v_until
    where id = p_target;
  end if;

  insert into admin_actions (admin_id, target_user_id, action, reason, suspended_until, related_report_id)
  values (v_actor, p_target, p_action, btrim(p_reason), v_until, p_report_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------- support requests ----------
create or replace function admin_set_support_status(p_request uuid, p_status text)
returns support_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_old   text;
  v_row   support_requests;
begin
  v_actor := admin_require('support');
  if p_status is null or p_status not in ('open','in_progress','resolved') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;

  select status into v_old from support_requests where id = p_request;
  if not found then
    raise exception 'Support request not found' using errcode = 'P0002';
  end if;

  update support_requests set status = p_status where id = p_request returning * into v_row;

  insert into admin_audit_log (actor_id, action, target_table, target_id, details)
  values (v_actor, 'support_status', 'support_requests', p_request,
          jsonb_build_object('from', v_old, 'to', p_status));
  return v_row;
end;
$$;

-- ---------- review reports ----------
create or replace function admin_resolve_review_report(p_report uuid, p_status text)
returns review_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_old   text;
  v_row   review_reports;
begin
  v_actor := admin_require('moderation');
  if p_status is null or p_status not in ('resolved','dismissed') then
    raise exception 'Status must be resolved or dismissed' using errcode = '22023';
  end if;

  select status into v_old from review_reports where id = p_report;
  if not found then
    raise exception 'Review report not found' using errcode = 'P0002';
  end if;
  if v_old <> 'pending' then
    raise exception 'This report was already handled (%)', v_old using errcode = '55000';
  end if;

  update review_reports set status = p_status where id = p_report returning * into v_row;

  insert into admin_audit_log (actor_id, action, target_table, target_id, details)
  values (v_actor, 'review_report', 'review_reports', p_report,
          jsonb_build_object('from', v_old, 'to', p_status));
  return v_row;
end;
$$;

-- ---------- roles (owner only) ----------
create or replace function admin_set_role(
  p_target      uuid,
  p_role        text,
  p_permissions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_old_role text;
  v_old_perm text[];
  v_new_perm text[];
begin
  v_actor := admin_require('owner');

  if p_role is null or p_role not in ('user','admin','owner') then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  if p_target = v_actor then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissions, '{}')) x
             where x not in ('support','moderation','finance')) then
    raise exception 'Unknown permission (allowed: support, moderation, finance)' using errcode = '22023';
  end if;

  select role, permissions into v_old_role, v_old_perm from users where id = p_target;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  v_new_perm := case when p_role = 'admin' then coalesce(p_permissions, '{}') else '{}' end;

  update users set role = p_role, permissions = v_new_perm where id = p_target;

  insert into admin_audit_log (actor_id, action, target_table, target_id, details)
  values (v_actor, 'set_role', 'users', p_target,
          jsonb_build_object('from_role', v_old_role, 'to_role', p_role,
                             'from_permissions', v_old_perm, 'to_permissions', v_new_perm));

  return jsonb_build_object('user_id', p_target, 'role', p_role, 'permissions', v_new_perm);
end;
$$;

-- ---------- permanent listing removal (owner only) ----------
create or replace function admin_remove_listing(p_listing uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_owner uuid;
  v_name  text;
begin
  v_actor := admin_require('owner');
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select owner_id, name into v_owner, v_name from listings where id = p_listing;
  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  insert into admin_actions (admin_id, target_user_id, action, reason, removed_listing_name)
  values (v_actor, v_owner, 'remove_listing', btrim(p_reason), v_name);

  delete from listings where id = p_listing;

  return jsonb_build_object('id', p_listing, 'name', v_name);
end;
$$;

-- ---------- dashboard counts (any admin or owner; no money) ----------
create or replace function admin_dashboard_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform admin_require('staff');
  return jsonb_build_object(
    'open_support_requests',  (select count(*) from support_requests where status <> 'resolved'),
    'pending_review_reports', (select count(*) from review_reports where status = 'pending'),
    'message_reports',        (select count(*) from message_reports),
    'restricted_accounts',    (select count(*) from users where account_status = 'restricted'),
    'suspended_accounts',     (select count(*) from users where account_status = 'suspended'),
    'banned_accounts',        (select count(*) from users where account_status = 'banned'),
    'pending_deletions',      (select count(*) from users where account_status = 'pending_deletion'),
    'active_listings',        (select count(*) from listings where is_active)
  );
end;
$$;

-- ---------- payments (finance permission or owner) ----------
create or replace function admin_recent_payments(p_limit integer default 50)
returns table (
  id         uuid,
  created_at timestamptz,
  status     text,
  plan_id    text,
  amount     numeric,
  currency   text,
  user_email text,
  paid_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require('finance');
  return query
    select p.id, p.created_at, p.status, p.plan_id, p.amount, p.currency, u.email, p.paid_at
    from payments p
    join users u on u.id = p.user_id
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------- who may call what ----------
-- Supabase gives anon/authenticated/service_role execute on new functions by default,
-- so take everything away first, then grant back only what the app needs.
revoke all on function admin_require(text)                                        from public, anon, authenticated, service_role;
revoke all on function admin_account_action(uuid, text, text, integer, uuid)      from public, anon;
revoke all on function admin_set_support_status(uuid, text)                       from public, anon;
revoke all on function admin_resolve_review_report(uuid, text)                    from public, anon;
revoke all on function admin_set_role(uuid, text, text[])                         from public, anon;
revoke all on function admin_remove_listing(uuid, text)                           from public, anon;
revoke all on function admin_dashboard_counts()                                   from public, anon;
revoke all on function admin_recent_payments(integer)                             from public, anon;

grant execute on function admin_account_action(uuid, text, text, integer, uuid)   to authenticated;
grant execute on function admin_set_support_status(uuid, text)                    to authenticated;
grant execute on function admin_resolve_review_report(uuid, text)                 to authenticated;
grant execute on function admin_set_role(uuid, text, text[])                      to authenticated;
grant execute on function admin_remove_listing(uuid, text)                        to authenticated;
grant execute on function admin_dashboard_counts()                                to authenticated;
grant execute on function admin_recent_payments(integer)                          to authenticated;

notify pgrst, 'reload schema';
