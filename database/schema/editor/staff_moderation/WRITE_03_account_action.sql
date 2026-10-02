-- STAFF (owner or admin). WRITES DATA. Warn / restrict / suspend / ban / undo, logged in admin_actions.
-- Edit ONLY the five values in the first block (marked "change me").
-- action: warn | restrict | unrestrict | suspend | unsuspend | ban | unban
-- days: only used for 'suspend'.
--
-- Rules enforced by this query (it does nothing and returns 0 rows if any is broken):
--   * the actor must be an ACTIVE owner, or an ACTIVE admin who has the 'moderation' permission
--   * you can't act on yourself
--   * an owner can never be actioned
--   * an admin can only be actioned by an owner
--   * the log records the REAL actor, not always the owner
with p as (
  select lower('PUT-YOUR-EMAIL-HERE')   as actor_email,   -- <-- change me (who is doing this)
         lower('PUT-TARGET-EMAIL-HERE') as target_email,   -- <-- change me (who it is done to)
         'suspend'                      as action,         -- <-- change me
         'PUT-REASON-HERE'              as reason,         -- <-- change me
         7                              as days            -- <-- change me
),
actor as (
  select u.id, u.role from users u, p
  where lower(u.email) = p.actor_email
    and u.account_status = 'active'
    and (u.role = 'owner' or (u.role = 'admin' and 'moderation' = any(u.permissions)))
),
target as (
  select u.id from users u, p, actor
  where lower(u.email) = p.target_email
    and u.id <> actor.id
    and (u.role = 'user' or (u.role = 'admin' and actor.role = 'owner'))
),
upd as (
  update users u
  set account_status  = case p.action
        when 'restrict'   then 'restricted'
        when 'suspend'    then 'suspended'
        when 'ban'        then 'banned'
        when 'unrestrict' then 'active'
        when 'unsuspend'  then 'active'
        when 'unban'      then 'active'
        else u.account_status end,
      status_reason   = case when p.action in ('restrict','suspend','ban') then p.reason else null end,
      suspended_until = case when p.action = 'suspend' then now() + make_interval(days => p.days) else null end
  from p, target
  where u.id = target.id and p.action <> 'warn'
  returning u.id
)
insert into admin_actions (admin_id, target_user_id, action, reason, suspended_until)
select actor.id, target.id, p.action, p.reason,
       case when p.action = 'suspend' then now() + make_interval(days => p.days) end
from actor, target, p
returning *;
-- 0 rows returned = nothing happened: wrong email, no permission, or a protected target.
