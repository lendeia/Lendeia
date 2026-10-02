-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — permanent rental history snapshots
-- PURPOSE   :
--   Two related problems, both about rental history not actually being
--   permanent history:
--
--   1) The item's name/photo shown in Rental History were only ever
--      looked up LIVE from the current `listings` row via a join —
--      never stored on the rental itself. That's why a renter viewing
--      history for an item the owner had since delisted saw the name
--      (which happened to still work after an earlier RLS fix) but not
--      the photo (which was looked up through a completely different,
--      narrower path that didn't cover this case) — "it saves data but
--      the photo doesn't, so it looks empty."
--
--   2) The much bigger issue: rentals.listing_id was `on delete cascade`
--      — permanently deleting a listing that has rental history
--      SILENTLY DELETED THAT HISTORY TOO (and any reviews attached to
--      it, since reviews.rental_id also cascades from rentals). A
--      completed rental and its review are a real historical record —
--      they should survive the listing being deleted later, the same
--      way an order history/receipt survives a product being
--      discontinued.
--
--   Fix: snapshot item_name/item_image_url onto `rentals` at creation
--   time (set once, by a trigger, never trusted from client input —
--   same principle as every other server-set field in this schema), and
--   change the listing_id foreign key from CASCADE to SET NULL, so
--   deleting a listing detaches it from old rentals instead of
--   destroying them. listing_id becomes nullable to allow that.
-- CONNECTS TO :
--   Consumed by backend/supabase/rentals.js's mapRentalRow (prefers the
--   new snapshot columns over the live listings embed). Existing rows
--   are backfilled from their CURRENT live listing where still possible
--   — a rental whose listing was already deleted before this migration
--   ran cannot be recovered, since that data is already gone.
-- ==================================================================

alter table rentals
  add column if not exists item_name text,
  add column if not exists item_image_url text;

-- Backfill what we still can from currently-live listings. Anything
-- already orphaned (listing deleted before this migration) stays null —
-- that data is genuinely gone, this can't invent it.
update rentals r
set item_name = coalesce(r.item_name, l.name),
    item_image_url = coalesce(r.item_image_url, l.primary_image_url)
from listings l
where r.listing_id = l.id
  and (r.item_name is null or r.item_image_url is null);

create or replace function snapshot_rental_item()
returns trigger as $$
declare
  v_name text;
  v_image text;
begin
  select name, primary_image_url into v_name, v_image
  from listings where id = new.listing_id;

  new.item_name := v_name;
  new.item_image_url := v_image;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_snapshot_rental_item on rentals;
create trigger trg_snapshot_rental_item
  before insert on rentals
  for each row execute function snapshot_rental_item();

-- Stop listing deletion from cascading away rental/review history.
alter table rentals alter column listing_id drop not null;

alter table rentals drop constraint if exists rentals_listing_id_fkey;
alter table rentals
  add constraint rentals_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete set null;

notify pgrst, 'reload schema';
