-- OWNER ONLY. WRITES DATA. Permanently deletes a listing and logs it under the real actor.
-- Rental history is kept (rentals.listing_id becomes null and the item snapshot stays).
-- Softer option first:  update listings set is_active = false where id = '...';
-- If listing_id is null, nothing is deleted and the status column says so.
with p as (
  select lower('lendeia.business@gmail.com') as actor_email,       -- <-- change me (you)
         null::uuid                    as listing_id,              -- <-- change me (null = no listing yet, or '<real-uuid>'::uuid)
         'PUT-REASON-HERE'             as reason                   -- <-- change me
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
),
del as (
  delete from listings
  where id = (select id from l) and exists (select 1 from log)
  returning id, name
)
select
  case
    when (select listing_id from p) is null then 'No listing ID given: nothing done'
    when not exists (select 1 from actor)   then 'Not an active owner: nothing done'
    when not exists (select 1 from l)       then 'Listing not found: nothing done'
    else 'Deleted'
  end as status,
  (select id from del)   as deleted_id,
  (select name from del) as deleted_name;