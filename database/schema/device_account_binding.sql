-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — cap real accounts per device to 2
-- PURPOSE   :
--   A device (identified by the persistent localStorage ID from
--   shared/deviceId.js, already used by device_wide_rental_cap.sql) can
--   only ever be associated with up to 2 real (non-anonymous) accounts.
--   The first 2 accounts that ever sign in/up from a device are
--   permanently "bound" to it and can always keep using it. A 3rd,
--   different account attempting to sign in OR sign up from that same
--   device is rejected -- even if that account is perfectly valid and
--   works fine from a different device.
--
--   HONEST LIMITATION, same as device_wide_rental_cap.sql: the device_id
--   lives in localStorage, so a private/incognito window starts with a
--   fresh one and isn't caught by this on its own. To also catch that
--   case, this also binds by IP ADDRESS (captured server-side, which
--   incognito does NOT hide) as a second signal -- but IP addresses are
--   often SHARED by unrelated people (same office/school/apartment
--   WiFi, same mobile carrier), so an IP-only match is treated as a
--   softer signal than a device_id match, not an automatic block, to
--   avoid wrongly locking out real different people who just share a
--   network. VPNs/mobile data that rotate IPs still aren't caught by
--   this at all -- there is no fully unbeatable version of this
--   buildable without a paid identity-verification service.
-- CONNECTS TO :
--   Checked by the check_device_account_limit() RPC, called from
--   state/auth/authStore.jsx immediately after every sign-in/sign-up,
--   for every auth path (Google, email/password sign-in, email/password
--   upgrade) since they all funnel through the same SIGNED_IN event.
--   IMPORTANT: the IP address is read SERVER-SIDE from PostgREST's
--   request headers inside this function -- never accepted as a
--   parameter from the client. A client-supplied "my IP is X" value
--   would be trivially fakeable and would defeat the entire point of
--   using IP as a signal in the first place.
-- ==================================================================

create table if not exists device_accounts (
  device_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  ip_address text,
  first_seen_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

create index if not exists idx_device_accounts_device on device_accounts(device_id);
create index if not exists idx_device_accounts_ip on device_accounts(ip_address);

alter table device_accounts enable row level security;
-- No client-facing policies at all, intentionally -- this table is only
-- ever read/written through the SECURITY DEFINER function below, never
-- directly by a client query.

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

  -- Real client IP, read server-side from the request PostgREST
  -- forwarded along -- x-forwarded-for can contain a comma-separated
  -- chain of proxies; the first entry is the original client.
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
      return query select false,
        'This device already has 2 accounts associated with it. Please sign in with one of those instead.';
      return;
    end if;
  end if;

  if v_ip is not null and v_ip <> '' then
    select count(distinct user_id) into v_ip_distinct_count
    from device_accounts where ip_address = v_ip;

    if v_ip_distinct_count >= 3 then
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
