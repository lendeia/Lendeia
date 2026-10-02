-- READ-ONLY. Latest payments.
select p.created_at, p.status, p.plan_id, p.amount, p.currency, u.email,
       p.paymongo_payment_id, p.paid_at
from payments p
join users u on u.id = p.user_id
order by p.created_at desc
limit 50;
