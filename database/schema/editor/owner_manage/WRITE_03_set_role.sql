-- OWNER ONLY. WRITES DATA. Make someone admin / owner, set what an admin may do, or demote.
-- role: 'user' | 'admin' | 'owner'
-- permissions (admin only): 'support', 'moderation', 'finance'   ('{}' = none)
-- Guards: actor must be an active owner; you can't change your own role;
--         there must always be at least one owner left.
with p as (
  select lower('PUT-OWNER-EMAIL-HERE')  as actor_email,    -- <-- change me (you)
         lower('PUT-TARGET-EMAIL-HERE') as target_email,   -- <-- change me
         'admin'                        as new_role,       -- <-- change me
         array['support','moderation']::text[] as new_permissions   -- <-- change me
),
actor as (
  select u.id from users u, p
  where lower(u.email) = p.actor_email and u.role = 'owner' and u.account_status = 'active'
)
update users u
set role = p.new_role,
    permissions = case when p.new_role = 'admin' then p.new_permissions else '{}' end
from p, actor
where lower(u.email) = p.target_email
  and u.id <> actor.id
  and p.new_role in ('user', 'admin', 'owner')
returning u.id, u.email, u.role, u.permissions;
-- 0 rows returned = nothing happened.
