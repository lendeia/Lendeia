-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — consent-based phone sharing + presence
-- PURPOSE   :
--   1) PHONE VISIBILITY — a phone number is NEVER visible to the other
--      party just because a rental was requested. It only becomes
--      visible once ALL of these are true:
--        - the rental is Accepted or Completed
--        - the RENTER has explicitly chosen to share their number for
--          THIS rental (renter_shared_phone)
--        - the OWNER has explicitly chosen to share their number for
--          THIS rental (owner_shared_phone)
--      Both sides must opt in — one side sharing does NOT reveal
--      anything to the other. This is enforced by get_shared_phone()
--      itself, a SECURITY DEFINER function that's the ONLY way to read
--      another user's phone number cross-account — there is no RLS
--      policy that exposes users.phone to anyone but its own owner, by
--      design (see profile_trust_fields.sql, which added the column
--      but never made it publicly selectable).
--   2) PRESENCE — a real last_active_at timestamp, updated by a
--      heartbeat from the account's own session (see
--      backend/supabase/users.js's updateMyLastActive(), called
--      periodically from state/auth/authStore.jsx). "Active now" /
--      "Active recently" is computed client-side from this real
--      timestamp, never fabricated.
-- CONNECTS TO :
--   Consumed by backend/supabase/rentals.js (sharePhone/getSharedPhone)
--   and backend/supabase/users.js (presence). Displayed in
--   Messages.jsx, Details.jsx, and Receipt.jsx.
-- ==================================================================

alter table rentals
  add column if not exists renter_shared_phone boolean not null default false,
  add column if not exists owner_shared_phone boolean not null default false;

alter table users
  add column if not exists last_active_at timestamptz;

-- Toggles the CALLER's own share flag for one specific rental — only
-- once it's actually Accepted/Completed, and only for whichever side
-- the caller actually is.
create or replace function set_phone_shared(p_rental_id uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renter_id uuid;
  v_owner_id uuid;
  v_status text;
begin
  select r.renter_id, l.owner_id, r.status
    into v_renter_id, v_owner_id, v_status
  from rentals r
  join listings l on l.id = r.listing_id
  where r.id = p_rental_id;

  if v_renter_id is null then
    raise exception 'Rental not found.' using errcode = '23503';
  end if;

  if v_status not in ('Accepted', 'Completed') then
    raise exception 'Contact info can only be shared once the rental is accepted.'
      using errcode = '23514';
  end if;

  if auth.uid() = v_renter_id then
    update rentals set renter_shared_phone = p_share where id = p_rental_id;
  elsif auth.uid() = v_owner_id then
    update rentals set owner_shared_phone = p_share where id = p_rental_id;
  else
    raise exception 'Only the renter or the owner of this rental can do this.'
      using errcode = '23514';
  end if;
end;
$$;

grant execute on function set_phone_shared(uuid, boolean) to authenticated;

-- Returns the OTHER party's phone number for this rental — but ONLY if
-- the caller is actually a participant, the rental is Accepted/
-- Completed, AND both sides have opted in. Returns null in every other
-- case, including "not shared yet" — never raises, so callers can just
-- treat null as "not available" without special-casing errors.
create or replace function get_shared_phone(p_rental_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renter_id uuid;
  v_owner_id uuid;
  v_status text;
  v_renter_shared boolean;
  v_owner_shared boolean;
  v_phone text;
begin
  select r.renter_id, l.owner_id, r.status, r.renter_shared_phone, r.owner_shared_phone
    into v_renter_id, v_owner_id, v_status, v_renter_shared, v_owner_shared
  from rentals r
  join listings l on l.id = r.listing_id
  where r.id = p_rental_id;

  if v_renter_id is null then
    return null;
  end if;

  if auth.uid() is distinct from v_renter_id and auth.uid() is distinct from v_owner_id then
    return null;
  end if;

  if v_status not in ('Accepted', 'Completed') or not v_renter_shared or not v_owner_shared then
    return null;
  end if;

  if auth.uid() = v_renter_id then
    select phone into v_phone from users where id = v_owner_id;
  else
    select phone into v_phone from users where id = v_renter_id;
  end if;

  return v_phone;
end;
$$;

grant execute on function get_shared_phone(uuid) to authenticated;

-- Lets the CALLER update only their own last_active_at — a lightweight
-- heartbeat, not a general-purpose write.
create or replace function touch_my_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update users set last_active_at = now() where id = auth.uid();
end;
$$;

grant execute on function touch_my_presence() to authenticated;

notify pgrst, 'reload schema';
