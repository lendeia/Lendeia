-- OWNER ONLY. WRITES DATA. Permanently deletes a listing and logs it under the real actor.
-- Rental history is kept (rentals.listing_id becomes null and the item snapshot stays).
-- Softer option first:  update listings set is_active = false where id = '...';
with p as (
  select lower('PUT-OWNER-EMAIL-HERE') as actor_email,       -- <-- change me (you)
         'PUT-LISTING-UUID-HERE'::uuid as listing_id,         -- <-- change me
         'PUT-REASON-HERE'             as reason              -- <-- change me
),
actor as (
  select u.id from users u, p
  where lower(u.email) = p.actor_email and u.role = 'owner' and u.account_status = 'active'
),
l   as (select id, owner_id, name from listings where id = (select listing_id from p)),
log as (
  insert into admin_actions (admin_id, target_user_id, action, reason, removed_listing_name)
  select actor.id, l.owner_id, 'remove_listing', p.reason, l.name from actor, l, p
  returning id
)
delete from listings
where id = (select id from l) and exists (select 1 from log)
returning id, name;
