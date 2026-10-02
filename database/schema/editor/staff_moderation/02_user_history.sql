-- READ-ONLY. Everything about one user: moderation log, reports against them, activity counts.
with t as (select id from users where email = 'PUT-EMAIL-HERE')   -- <-- change me
select 'admin action' as kind, a.created_at, a.action as detail, a.reason as note
from admin_actions a, t where a.target_user_id = t.id
union all
select 'reported in ' || sr.category, sr.created_at, sr.status, left(sr.message, 200)
from support_requests sr, t where sr.reported_user_id = t.id
union all
select 'rentals as renter', now(), count(*)::text, null from rentals r, t where r.renter_id = t.id
union all
select 'listings owned', now(), count(*)::text, null from listings l, t where l.owner_id = t.id
order by 2 desc;
