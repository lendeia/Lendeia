-- READ-ONLY. Payments still 'pending' after an hour. Check these in the PayMongo dashboard.
select p.id, p.created_at, p.plan_id, p.amount, u.email, p.paymongo_checkout_session_id
from payments p
join users u on u.id = p.user_id
where p.status = 'pending' and p.created_at < now() - interval '1 hour'
order by p.created_at;
