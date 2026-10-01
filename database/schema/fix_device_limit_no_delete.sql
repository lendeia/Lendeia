-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — stop the device limit from deleting
--             real accounts (SAFETY FIX — run this soon)
-- PURPOSE   :
--   fix_device_limit_retry.sql made check_device_account_limit() DELETE
--   the signed-in account (from auth.users and public.users) whenever
--   the device already had 2 accounts. That function runs after EVERY
--   sign-in, not only after a brand-new signup. So signing into an
--   OLD, perfectly valid account from a device that already has 2 other
--   accounts (very easy while testing with a few emails) permanently
--   deleted that account, along with its listings, rentals and reviews.
--   Afterwards that email can never log in again and Supabase answers
--   "Invalid login credentials", which looks like a wrong password.
--
--   This version keeps the 2-accounts-per-device (and 3-per-IP) rule
--   and still cleans up a signup that was rejected, but it only deletes
--   an account that is BOTH brand new (created within the last 30
--   minutes) AND completely empty (no listings, rentals or reviews).
--   Anything older, or with any history, is NEVER deleted: the person is
--   just refused on this device and signed out, and can still sign in
--   from another device.
--   Run once in the Supabase SQL editor. Safe to run twice.
-- CONNECTS TO :
--   state/auth/authStore.jsx's checkDeviceAccountLimit().
-- ==================================================================

create or replace function check_device_account_limit(p_device_id text)
returns table (allowed boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_anonymous boolean;
  v_created_at timestamptz;
  v_disposable boolean := false;
  v_device_distinct_count integer;
  v_already_bound boolean;
  v_ip_distinct_count integer;
  v_ip text;
begin
  select is_anonymous, created_at into v_is_anonymous, v_created_at
  from users where id = v_user_id;
  if coalesce(v_is_anonymous, true) then
    return query select true, null::text;
    return;
  end if;

  -- Only a brand-new account with no history may be removed when it is
  -- rejected; see the file header.
  v_disposable :=
    v_created_at is not null
    and v_created_at > now() - interval '30 minutes'
    and not exists (select 1 from listings where owner_id = v_user_id)
    and not exists (select 1 from rentals where renter_id = v_user_id)
    and not exists (select 1 from reviews where reviewer_id = v_user_id);

  begin
    v_ip := split_part(
      (current_setting('request.headers', true)::json ->> 'x-forwarded-for'),
      ',', 1
    );
  exception when others then
    v_ip := null;
  end;

  if p_device_id is not null then
    select exists(
      select 1 from device_accounts where device_id = p_device_id and user_id = v_user_id
    ) into v_already_bound;

    if v_already_bound then
      return query select true, null::text;
      return;
    end if;

    select count(distinct user_id) into v_device_distinct_count
    from device_accounts where device_id = p_device_id;

    if v_device_distinct_count >= 2 then
      if v_disposable then
        delete from public.users where id = v_user_id;
        delete from auth.users where id = v_user_id;
      end if;
      return query select false,
        'This device already has 2 accounts associated with it. Please sign in with one of those instead.';
      return;
    end if;
  end if;

  if v_ip is not null and v_ip <> '' then
    select count(distinct user_id) into v_ip_distinct_count
    from device_accounts where ip_address = v_ip;

    if v_ip_distinct_count >= 3 then
      if v_disposable then
        delete from public.users where id = v_user_id;
        delete from auth.users where id = v_user_id;
      end if;
      return query select false,
        'Too many accounts have been created from this network. Please sign in with an existing account.';
      return;
    end if;
  end if;

  insert into device_accounts (device_id, user_id, ip_address)
  values (coalesce(p_device_id, 'unknown-' || v_user_id::text), v_user_id, nullif(v_ip, ''))
  on conflict (device_id, user_id) do nothing;

  return query select true, null::text;
end;
$$;

grant execute on function check_device_account_limit(text) to authenticated;

notify pgrst, 'reload schema';