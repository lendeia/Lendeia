-- READ-ONLY. Paid revenue per month and plan.
select date_trunc('month', paid_at)::date as month, plan_id,
       count(*) as payments, sum(amount) as total, max(currency) as currency
from payments
where status = 'paid'
group by 1, 2
order by 1 desc, 2;
