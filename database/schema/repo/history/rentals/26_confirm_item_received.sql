-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — owner-confirmed item handoff
-- PURPOSE   :
--   Adds a real "the item has actually been handed over" signal,
--   separate from the rental's scheduled start_date (which is just a
--   plan, not proof anything physically happened). Confirmed by the
--   OWNER specifically — not the renter — since the owner is the party
--   giving up the item and has no incentive to falsely confirm a
--   handoff that didn't happen. This is also consistent with how
--   Accept/Decline/Mark Completed already work in this app: the owner
--   is the one who tracks their item's real-world state, not the
--   renter.
--   Before handoff is confirmed: the renter's rental history shows
--   "Cancel" (backing out of something not yet in their hands). After:
--   "Return Item" (they actually have it, returning is the honest verb).
-- CONNECTS TO :
--   received_at is set via confirm_item_received() (SECURITY DEFINER,
--   owner-only, only while status='Accepted'). Read by
--   backend/supabase/rentals.js's mapRentalRow, used by
--   Dashboard.jsx's RequestRow to choose Cancel vs Return Item, and by
--   a new "Confirm Handoff" button on the OWNER's side.
-- ==================================================================

alter table rentals add column if not exists received_at timestamptz;

create or replace function confirm_item_received(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_status text;
begin
  select l.owner_id, r.status into v_owner_id, v_status
  from rentals r
  join listings l on l.id = r.listing_id
  where r.id = p_rental_id;

  if v_owner_id is null then
    raise exception 'Rental not found.' using errcode = '23503';
  end if;
  if auth.uid() is distinct from v_owner_id then
    raise exception 'Only the listing owner can confirm handoff.' using errcode = '23514';
  end if;
  if v_status <> 'Accepted' then
    raise exception 'Handoff can only be confirmed for an accepted rental.' using errcode = '23514';
  end if;

  update rentals set received_at = now() where id = p_rental_id and received_at is null;
end;
$$;

grant execute on function confirm_item_received(uuid) to authenticated;

notify pgrst, 'reload schema';
