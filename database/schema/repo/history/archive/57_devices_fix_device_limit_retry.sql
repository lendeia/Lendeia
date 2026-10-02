-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - fix retrying after the device
--             limit rejects a signup (new; also undoes
--             remove_device_account_limit.sql if that was run - the
--             2-account limit itself was correct and meant to stay,
--             only RETRYING a rejected attempt was actually broken)
-- PURPOSE   :
--   Real root cause: check_device_account_limit() (device_account_
--   binding.sql) runs on the SIGNED_IN event, which fires AFTER
--   Supabase has already created the real account for that signup
--   attempt. When this function then rejects it (device already has 2
--   accounts), state/auth/authStore.jsx signs the browser back out -
--   but the just-created account was never actually removed. That
--   left a real, orphaned account sitting there bound to whatever
--   email was just used, so retrying with the SAME email failed with
--   a confusing "already registered" error, even though - from the
--   person's own point of view - they never successfully made an
--   account at all.
--   This makes a rejection actually undo itself: when the device/IP
--   limit says no, the account that was JUST created for that attempt
--   is deleted outright, immediately freeing the email for a clean
--   retry. The 2-accounts-per-device (and 3-per-IP) limit itself is
--   unchanged and still real.
-- CONNECTS TO :
--   state/auth/authStore.jsx's checkDeviceAccountLimit(), which calls
--   this RPC on every SIGNED_IN event.
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
  v_device_distinct_count integer;
  v_already_bound boolean;
  v_ip_distinct_count integer;
  v_ip text;
begin
  select is_anonymous into v_is_anonymous from users where id = v_user_id;
  if coalesce(v_is_anonymous, true) then
    return query select true, null::text;
    return;
  end if;

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
      -- The real fix: this signup attempt's account is deleted right
      -- here, not left behind as an orphan — so the email it used is
      -- immediately free again for a real, clean retry (e.g. signing
      -- in with one of the device's existing 2 accounts instead, or
      -- trying on a different device).
      delete from public.users where id = v_user_id;
      delete from auth.users where id = v_user_id;
      return query select false,
        'This device already has 2 accounts associated with it. Please sign in with one of those instead.';
      return;
    end if;
  end if;

  if v_ip is not null and v_ip <> '' then
    select count(distinct user_id) into v_ip_distinct_count
    from device_accounts where ip_address = v_ip;

    if v_ip_distinct_count >= 3 then
      delete from public.users where id = v_user_id;
      delete from auth.users where id = v_user_id;
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
